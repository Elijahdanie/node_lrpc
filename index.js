const path = require("path");
const fs = require("fs");
const { RabbitMq } = require("./rabbitmq");
const { Redis } = require("ioredis");
const { genericListFetch, LRPCLimit, LRPCResource } = require('./decorators/auth.js')
const { LRPCMedia } = require('./decorators/media.js')
const { LRPCRedirect, LRPCCallback } = require('./decorators/url.js')
const cors = require('cors');
const AuthService = require('./auth/auth');
const { Server } = require('socket.io');
const { createServer } = require('http');

const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

require("reflect-metadata");

const { typeLibrary,
  propAccumulator,
  serviceHandlerPromises,
  createServiceClient,
  createFEClient } = require("./bin/clientGenerator");
const { fetchScriptRemote } = require("./bin/scriptRepository");
const { secret } = require("../../../lrpc.config.js");


class LRPCEngine {
  service;
  environment;
  container;
  url;
  handlers = {};
  clientHandlers = {};
  static instance;
  static trackInstance = 0;
  authorize;
  Queue;
  redis;
  isGateway;
  io;
  socketConfig;
  clientSockets = {};

  constructor(
    service,
    authorize,
    url,
    Container,
    socketConfig,
    isGateway = false
  ) {
    if (LRPCEngine.instance) {
      throw new Error("Cannot create multiple instances of LRPCEngine");
    }
    this.url = url;
    this.service = service;
    this.environment = `${process.env.NODE_ENV}`;
    this.isGateway = isGateway;
    this.socketConfig = socketConfig;

    try {
      this.Queue = new RabbitMq(`${this.service}-${this.environment}`, { server: process.env.RABBITMQ_URL });
    } catch (error) {
      console.log(error);
    }


    this.redis = new Redis(process.env.REDIS_URL);
    this.authorize = authorize;
    LRPCEngine.instance = this;
    LRPCEngine.trackInstance++;
    this.container = Container;
    // console.log('CREATED INSTANCE');
  }

  isLocal = (key) => {
    return key.split(".")[0] === this.service;
  };

  initSocket = (app) => {
    const server = createServer(app);
    this.io = new Server(server);
    this.io.on('connection', async (socket) => {
      const token = socket.handshake.query.token;
      const path = socket.handshake.query.path;

      if (!token) {
        socket.disconnect();
        return;
      }

      const authResponse = await AuthService.verify(token, path, 'regular');

      if (authResponse.status !== 'success') {
        socket.disconnect();
        return;
      }

      if (this.clientSockets[authResponse.data.id]) {
        this.clientSockets[authResponse.data.id].disconnect();
      }

      this.clientSockets[authResponse.data.id] = socket;

      socket.on('disconnect', async () => {
        console.log('disconnected', authResponse.data.id);
        delete this.clientSockets[authResponse.data.id];
      });
    });

    return server;
  }

  disconnectSocket = (id) => {
    if (this.clientSockets[id]) {
      this.clientSockets[id].disconnect();
    }
  }

  sendSocketMessage = (id, data) => {
    if (this.clientSockets[id]) {
      this.clientSockets[id].emit('message', data);
    }
  }

  processQueueRequest = async () => {
    this.Queue.process(async (payload, done) => {
      try {
        const { path, data, srcPath, token } = payload;
        console.log(payload);
        const endpoint = this.handlers[path];
        const func = this.container.get(endpoint);
        if (func) {
          await func.handler(
            {
              request: {},
              response: {},
              payload: data
            }
          );
          done();
          // if (response) {
          //   this.Queue.add({
          //     path: srcPath,
          //     data: response,
          //     token,
          //   });
          //   done();
          // }
        }
      } catch (error) {
        console.log(error.message);
        done(true);
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
        if (request.headers['content-type'].includes('multipart/form-data')) {
          const { path, ...data } = request.body;
          return {
            path,
            data
          }
        }
        return request.body;
      case 'PUT':
        // Handle PUT request
        if (request.headers['content-type'].includes('multipart/form-data')) {
          const { path, ...data } = request.body;
          return {
            path,
            data
          }
        }
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

  fetchDataFromCallback = (request) => {
    // construct path from request
    const path = request.originalUrl.split('?');
    // remove the query part of the url
    const splitPath = path[0].split("/");
    const formatedPath = `${this.service}.${splitPath[1]}.${splitPath[2]}`;

    switch (request.method) {
      case 'GET':
        return {
          path: formatedPath,
          data: request.query
        }
      case 'POST':
        // Handle POST request
        return {
          path: formatedPath,
          data: request.body
        }
      case 'PUT':
        // Handle PUT request
        return {
          path: formatedPath,
          data: request.body
        }
      case 'DELETE':
        return {
          path: formatedPath,
          data: request.query
        }
      default:
        // Handle other types of requests
        return null;
    }
  }

  processRequest = async (req, res) => {
    // console.log(this.handlers);
    // console.log('called Endpoint');

    let context = null;

    try {
      const { path, data } = this.fetchPayload(req);

      if (!path) {
        res.status(200).json({
          message: 'Path not specified in payload',
          status: 'error'
        });
        return;
      }

      if (!this.isLocal(path)) {
        const func = this.clientHandlers[path];
        if (func) {
          // const newToken = `LRPC ${JSON.stringify(context)} ${req.headers.authorization}`;
          const response = await func.request(data, req.headers.authorization);
          res.status(200).json(response);
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

      const classInstance = this.container.get(className);

      const metadataValue = Reflect.getMetadata(
        "auth",
        classInstance,
        "handler"
      );
      // console.log(metadataValue);

      if (metadataValue) {
        // const authResponse = await LRPCEngine.instance.authorize(
        //   req.headers.authorization,
        //   path,
        //   metadataValue
        // );

        const authResponse = await AuthService.verify(
          req.headers.authorization,
          path,
          metadataValue
        );

        // console.log(authResponse, 'AUTH RESPONSE');

        if (authResponse.status !== "success") {
          // console.log(authResponse);
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

    try {
      const token = req.headers.authorization;

      // console.log(token, secret, 'TOKEN');
      if (!token || token !== secret) {
        res.status(200).json({
          message: 'Unauthorized Access',
          status: 'unauthorized'
        });
        return;
      }

      const script = await fetchScriptRemote(this.environment, this);
      res.status(200).json({
        message: 'Fetched script',
        status: 'success',
        data: script
      });


    } catch (error) {
      res.status(500).json({
        message: 'internal server error'
      })
    }
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

  processCallbacks = async (req, res) => {
    const { path, data } = this.fetchDataFromCallback(req);

    const className = await this.handlers[path];

    if (!className) {
      res.status(404).json({
        message: "Resource not found",
        status: "notFound",
        // data: null
      });
      return;
    }

    const classInstance = this.container.get(className);

    const response = await classInstance.handler({
      request: req,
      response: res,
      payload: data
    });

    if (response) res.status(200).json(response);


  }


  processControllers = async (controllers, app) => {
    // console.log(controllers);
    await Promise.all(Object.keys(controllers).map(async (controller) => {

      controllers[controller].forEach(async (endpoint) => {
        // const methodKey = `${this.service}.${controller}.${endpoint.name}`;
        // console.log(endpoint.name);
        const fetchMetaKeyforCallback = Reflect.getMetadata("callback", endpoint.prototype, "handler");
        // console.log(fetchMetaKeyforCallback, 'META');
        if (fetchMetaKeyforCallback) {
          const path = `/${controller.replace('Controller', '')}/${endpoint.name}`;
          app.use(path, this.processCallbacks);
        }
        LRPCEngine.instance.container.set(endpoint.name, new endpoint());
      });
    }));

    // this.processQueueRequest();
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

      if (!script) {
        script = {};
      }

      const derivedClass = Object.getPrototypeOf(constructor);

      if (derivedClass.name) {
        script = {
          ...script,
          ...propAccumulator[derivedClass.name]
        }

        propAccumulator[constructor.name] = script;
      }

      let finalScript = '';
      // console.log(script, 'script')
      // replicate the class
      finalScript = `class ${constructor.name} {
${Object.keys(script).map(key => `\t${key}${script[key].optional ? '?' : ''}: ${script[key].type};`).join("\n")
        }
}`;

      // console.log(finalScript);

      if (isResponse) {
        finalScript = `class ${constructor.name}{\n\tmessage: string\n\tstatus: Status\n\tdata: {\n`;
        finalScript += `
${Object.keys(script).map(key => `\t\t${key}${script[key].optional ? '?' : ''}: ${script[key].type};`).join("\n")
          }\n\t}\n}
  `
      }

      if (!typeLibrary[path]) {
        typeLibrary[path] = {};
      }
      typeLibrary[path][constructor.name] = finalScript;
    };

const LRPCPropOp = (target, key) => {
  const propertyType = Reflect.getMetadata("design:type", target, key);
  const className = target.constructor.name;

  // check if the proprty type is not a primitive type
  const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(propertyType.name);

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: isPrimitive ? propertyType.name.toLowerCase() : propertyType.name,
      optional: true
    }
  }
}

const LRPCObjectProp = (_value, optional) => (target, key) => {
  const className = target.constructor.name;

  const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(_value.name);

  const finalType = isPrimitive ? _value.name.toLowerCase() : _value.name;

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: `{ [key: string]: ${finalType} }`,
      optional
    }
  };
};

const LRPCProp = (target, key) => {
  const propertyType = Reflect.getMetadata("design:type", target, key);
  const className = target.constructor.name;

  // check if the proprty type is not a primitive type
  const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(propertyType.name);

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: isPrimitive ? propertyType.name.toLowerCase() : propertyType.name,
      optional: false
    }
  }
}

const LRPCSocket = (target, key) => {
  Reflect.defineMetadata("socket", "1", target, key);
}

const LRPCPropArray = (type, isoptional) => (target, key) => {
  const className = target.constructor.name;

  if (type) {
    const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(type.name);

    const finalType = isPrimitive ? type.name.toLowerCase() : type.name;

    propAccumulator[className] = {
      ...propAccumulator[className],
      [key]: {
        type: `${finalType}[]`,
        optional: isoptional
      }
    }
  } else {
    propAccumulator[className] = {
      ...propAccumulator[className],
      [key]: {
        type: 'any[]',
        optional: isoptional
      }
    }
  }
}

const initLRPC = (
  config,
  authorize,
  controllers,
  serviceClients,
  Container,
  socketConfig
) => {

  const { service, app, isGateway, corsConfig } = config;

  if (!process.env.SERVICEHOST) {
    console.warn('Please provide a SERVICEHOST in your .env to ensure proper code generation');
  }

  if (!process.env.GATEWAYURL) {
    console.warn('Please provide a GATEWAYURL in your .env to ensure proper code generation');
  }

  app.use(cors(corsConfig));

  const LRPC = new LRPCEngine(service, authorize, process.env.SERVICEHOST, Container, socketConfig, isGateway);
  LRPC.processControllers(controllers, app);
  LRPC.processClientControllers(serviceClients);
  LRPC.processQueueRequest();

  app.use("/lrpc", upload.array('files'), LRPC.processRequest);

  app.get("/client", LRPC.fetchScript);

  createServiceClient(LRPC);
  createFEClient(LRPC);

  if(socketConfig){
  const server = LRPC.initSocket(app);
  server.listen(process.env.PORT, () => {
    console.log(`Server/Websocket listening on port ${process.env.PORT}`);
  });
  } else {
    app.listen(process.env.PORT, () => {
      console.log(`Server listening on port ${process.env.PORT}`);
    });
  }

  AuthService.init();

  return LRPC;
};

const LRPCFunction =
  (controller, request, response, service = false) =>
    (target, name, descriptor) => {
      serviceHandlerPromises.push(async () => {
        // const paramNames = LRPCEngine.getParameterNames(descriptor.value);

        let methodName = target.constructor.name;
        const methodKey = `${LRPCEngine.instance.service}.${controller}.${methodName}`;
        await LRPCEngine.instance.registerCallback(methodKey, methodName);
        // console.log(methodKey, 'methodKey');
        const metadataValue = Reflect.getMetadata(
          "auth",
          target,
          "handler"
        );

        return {
          service,
          methodName,
          name,
          request,
          response,
          controller,
          isAuth: metadataValue,
          isMedia: Reflect.getMetadata("media", target, name),
          isSocket: Reflect.getMetadata("socket", target, name) ? true : false
        };
      });

      // console.log(serviceHandlerPromises, 'setup');

      return descriptor;
    };



module.exports = {
  LRPCFunction,
  LRPCPayload,
  LRPCAuth,
  LRPCProp,
  LRPCPropArray,
  LRPCEngine,
  AuthService,
  initLRPC,
  genericListFetch,
  LRPCLimit,
  LRPCResource,
  LRPCMedia,
  LRPCCallback,
  LRPCRedirect,
  LRPCPropOp,
  LRPCObjectProp,
  LRPCSocket
};