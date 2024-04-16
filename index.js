const path = require("path");
const fs = require("fs");
const { RabbitMq } = require("./rabbitmq");
const { Redis } = require("ioredis");

require("reflect-metadata");

const {typeLibrary,
  propAccumulator,
  serviceHandlerPromises,
  createServiceClient,
  createFEClient } = require("./bin/clientGenerator");
const { fetchScript, fetchScriptRemote } = require("./bin/scriptRepository");
const { secret } = require("../../lrpc.config");


class LRPCEngine {
service;
environment;
container;
url;
apiGateWay;
handlers = {};
clientHandlers = {};
static instance;
static trackInstance = 0;
authorize;
Queue;
redis;

constructor(
  service,
  authorize,
  url,
  rabbitmqUrl,
  redis,
  Container,
  apiGateWay
) {
  if (LRPCEngine.instance) {
    throw new Error("Cannot create multiple instances of LRPCEngine");
  }
  this.url = url;
  this.service = service;
  this.apiGateWay = apiGateWay;
  this.environment = `${process.env.NODE_ENV}`;

  try {
    this.Queue = new RabbitMq(this.environment, { server: rabbitmqUrl });
  } catch (error) {
    console.log(error);
  }

  this.redis = new Redis(redis);
  this.authorize = authorize;
  LRPCEngine.instance = this;
  LRPCEngine.trackInstance++;
  this.container = Container;
  // console.log('CREATED INSTANCE');
}

isLocal = (key) => {
  return key.split(".")[0] === this.service;
};

processQueueRequest = async () => {
  this.Queue.process(async ({ payload }, done) => {
    const { path, data, srcPath, token } = payload;
    const endpoint = this.handlers[path];
    const func = this.container.get(endpoint);
    if (func) {
      const response = await func(data, token);
      if (response) {
        this.Queue.add({
          path: srcPath,
          data: response,
          token,
        });
        done();
      }
    }
  });
};

fetchPayload = (request) => {
  switch (request.method) {
    case 'GET':
      return {
        path: request.query.path,
        data: request.query.data ? JSON.parse(request.query.data) : null
      }
    case 'POST':
      // Handle POST request
      return request.body;
    case 'PUT':
      // Handle PUT request
      return request.body;
    case 'DELETE':
      return {
        path: request.query.path,
        data: request.query.data ? JSON.parse(request.query.data) : null
      }
    default:
      // Handle other types of requests
      return null;
  }
}

processRequest = async (req, res) => {
  // console.log(this.handlers);
  // console.log('called Endpoint');
  try {
    const { path, data } = this.fetchPayload(req);

    if (!this.isLocal(path)) {
      // console.log(path);
      const func = this.clientHandlers[path];
      // console.log(func, 'FUNCTION', this.clientHandlers);
      if(func && func.auth){
        const authResponse = LRPCEngine.instance.authorize(
          req.headers.authorization,
          func.auth
        );
  
        if (authResponse.status !== "success") {
          res.status(200).json(authResponse);
          return;
        }
  
        context = authResponse.data;
      }
      if (func) {
        const response = await func.request(data, req.headers.authorization);
        res.status(200).json(response);
        console.log("called");
        return;
      }
    }

    const className = await this.handlers[path];

    if (!className) {
      res.status(200).json({
        message: "Resource not found",
        status: "notFound",
        // data: null
      });
      return;
    }

    // console.log(typeof className, LRPCEngine.trackInstance);

    let context = null;

    const classInstance = this.container.get(className);

    const metadataValue = Reflect.getMetadata(
      "auth",
      classInstance,
      "handler"
    );
    // console.log(metadataValue);

    if (metadataValue) {
      const authResponse = await LRPCEngine.instance.authorize(
        req.headers.authorization,
        path,
        metadataValue
      );

      if (authResponse.status !== "success") {
        console.log(authResponse);
        res.status(200).json(authResponse);
        return;
      }

      context = authResponse.data;
      context.path = path;
    }

    let isValid = { message: "", status: "" };

    try {
      isValid = await classInstance.validator(data);
    } catch (error) {
      console.log(error);
      res.status(200).json({
        message: error.message,
        status: "validationError",
        // data: null
      });
      return;
    }

    if (isValid.status !== "success") {
      res.status(200).json({
        message: isValid.message,
        status: isValid.status,
        // data: null
      });
      return;
    }

    const response = await classInstance.handler({
      request: req,
      response: res,
      payload: data,
      context,
    });

    if (response) res.status(200).json(response);
  } catch (error) {
    console.log(error);
    res.status(200).json({
      message: error.message,
      status: "error",
      // data: null
    });
  }
};

fetchScript = async (req, res) => {
  console.log(req.headers, 'headers')
  
  const token = req.headers.authorization;

  if(!token || token !== secret){
    res.status(200).json({
      message: 'Unauthorized',
      status: 'unauthorized'
    });
    return;
  }

  const script = await fetchScriptRemote(this.environment);
  res.status(200).json(script);
}

processClientControllers = async (serviceClients) => {

  await Promise.all(
    Object.keys(serviceClients).map(async (data) => {
      // console.log(data);
      Object.keys(serviceClients[data]).map((endpointName) => {
        Object.keys(serviceClients[data][endpointName]).map((key) => {
          // console.log(key, endpoint[key]);
          const methodKey = `${data}.${endpointName}.${key}`;
          const endpoint = serviceClients[data][endpointName];
          this.clientHandlers[methodKey] = endpoint[key];
        });
      });
    }
  ));
};


processControllers = async (controllers) => {
  // console.log(controllers);
  await Promise.all(Object.keys(controllers).map(async (controller) => {
    
    controllers[controller].forEach(async (endpoint) => {
      // const methodKey = `${this.service}.${controller}.${endpoint.name}`;
      // console.log(endpoint.name);
      LRPCEngine.instance.container.set(endpoint.name, new endpoint());
    });
  }));
};

static getParameterNames(func) {
  const match = func.toString().match(/^async\s*\w+\s*\((.*?)\)/);
  if (match && match[1]) {
    return match[1].split(",").map((param) => param.trim());
  }
  return [];
}

/**
 * Register a handler for a path
 * @param path
 * @param handler
 */
async registerCallback(methodKey, className) {
  this.handlers[methodKey] = className;
}
}

const LRPCAuth =
(roles) =>
(target, name, descriptor) => {
  Reflect.defineMetadata("auth", roles ? roles : "regular", target, name);
};

const LRPCPayload =
(path, isResponse = false) =>
(constructor) => {
  // console.log(constructor.name);
  let script = propAccumulator[constructor.name];

  if(!script){
    script = {};
  }

  const derivedClass = Object.getPrototypeOf(constructor);
    
  if(derivedClass.name){
      script = {
          ...script,
          ...propAccumulator[derivedClass.name]
      }

      propAccumulator[constructor.name] = script;
  }

  let finalScript = '';

  // replicate the class
   finalScript = `class ${constructor.name} {
${Object.keys(script).map(key => `\t${key}?: ${script[key]};`).join("\n")
  }
}`;

  // console.log(finalScript);

  if(isResponse){
      finalScript = `class ${constructor.name}{\n\tmessage: string\n\tstatus: Status\n\tdata?: {\n`;
      finalScript += `
${Object.keys(script).map(key => `\t\t${key}?: ${script[key]};`).join("\n")
  }\n\t}\n}
  `
  }

  if (!typeLibrary[path]) {
    typeLibrary[path] = {};
  }
  typeLibrary[path][constructor.name] = finalScript;
};

const LRPCProp = (target, key) => {
  const propertyType = Reflect.getMetadata("design:type", target, key);
  const className = target.constructor.name;

  propAccumulator[className] = {
      ...propAccumulator[className],
      [key]: propertyType.name
  }
}

const LRPCPropArray = (type) => (target, key) => {
  const className = target.constructor.name;

  propAccumulator[className] = {
      ...propAccumulator[className],
      [key]: `${ type ? type.name : 'any'}[]`
  }
}

const initLRPC = (
config,
authorize,
controllers,
serviceClients,
Container
) => {
const { service, app, port, hostname, apiGateWay } = config;
const url = hostname
  ? `https://${hostname}/lrpc`
  : `http://localhost:${port}/lrpc`;
const LRPC = new LRPCEngine(service, authorize, url, config.rabbitmqUrl, config.redis, Container, apiGateWay);
LRPC.processControllers(controllers);
LRPC.processClientControllers(serviceClients);
LRPC.processQueueRequest();

app.use("/lrpc", LRPC.processRequest);

app.get("/client", LRPC.fetchScript);

createServiceClient(url, LRPC);
createFEClient(url, LRPC);

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

return LRPC;
};

const LRPCFunction =
(controller, request, response, isAuth) =>
(target, name, descriptor) => {
  serviceHandlerPromises.push(async () => {
    // const paramNames = LRPCEngine.getParameterNames(descriptor.value);

    let methodName = target.constructor.name;
    const methodKey = `${LRPCEngine.instance.service}.${controller}.${methodName}`;
    await LRPCEngine.instance.registerCallback(methodKey, methodName);
    const metadataValue = Reflect.getMetadata(
      "auth",
      target,
      "handler"
    );

    return {
      methodName,
      name,
      request,
      response,
      controller,
      isAuth: metadataValue
    };
  });

  // console.log(serviceHandlerPromises, 'setup');

  return descriptor;
};

const getType = (name) => {
switch (name) {
  case "string":
    return "string";
  case "number":
    return "number";
  case "boolean":
    return "boolean";
  default:
    return "any";
}
};


module.exports = {
LRPCFunction,
LRPCPayload,
LRPCAuth,
LRPCProp,
LRPCPropArray,
LRPCEngine,
initLRPC
};