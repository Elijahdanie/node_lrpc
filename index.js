const path = require("path");
const fs = require("fs");
const helmet = require("helmet");

const { RabbitMq } = require("./rabbitmq");
const { Redis } = require("ioredis");
const { genericListFetch, LRPCLimit, LRPCResource } = require("./decorators/auth.js");
const { LRPCMedia } = require("./decorators/media.js");
const { LRPCRedirect, LRPCCallback } = require("./decorators/url.js");
const cors = require("cors");
const AuthService = require("./auth/auth");
const { Server } = require("socket.io");
const { createServer } = require("http");
const { workerData, parentPort, Worker } = require("worker_threads");

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage
});

require("reflect-metadata");

const {
  typeLibrary,
  propAccumulator,
  serviceHandlerPromises,
  createServiceClient,
  createFEClient,
} = require("./bin/clientGenerator");

const { fetchScriptRemote } = require("./bin/scriptRepository");
const { secret } = require("../../../lrpc.config.js");
const { subScribeEvent, LRPCEvent, EventManager, Events, Subscribers, createLRPCEvent } = require("@elijahdanie/lrpc/logging/event.js");

const sockcetHandlerPromises = [];

class LRPCEngine {
  service;
  tId;
  environment;
  container;
  url;
  handlers = {};
  clientHandlers = {};
  socketHandlers = {};
  static instance;
  static trackInstance = 0;
  authorize;
  oauthAuthorize;
  Queue;
  redis;
  isGateway;
  io;
  socketConfig;
  clientSockets = {};
  application;
  eventManager;

  constructor(
    application,
    service,
    authorize,
    oauthAuthorize,
    url,
    Container,
    socketConfig,
    isGateway = false
  ) {
    if (LRPCEngine.instance) {
      throw new Error("Cannot create multiple instances of LRPCEngine");
    }
    this.url = url;
    this.application = application;
    this.service = service;
    this.environment = `${process.env.NODE_ENV}`;
    this.isGateway = isGateway;
    this.socketConfig = socketConfig;
    this.eventManager = new EventManager(this);

    try {
      this.Queue = new RabbitMq(`${this.service}-${this.environment}`, {
        server: process.env.RABBITMQ_URL,
      });
    } catch (error) {
      console.log(error);
    }

    this.redis = new Redis(process.env.REDIS_URL);
    this.authorize = authorize;
    this.oauthAuthorize = oauthAuthorize;
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
    this.io = new Server(server, {
      cors: {
        origin: "*"
      }
    });
    this.io.on("connection", async (socket) => {
      const token = socket.handshake.query.token;
      const path = socket.handshake.query.path;

      if (!token) {
        socket.disconnect();
        return;
      }

      const authResponse = await AuthService.verify(token, path, "regular");

      if (authResponse.status !== "success") {
        socket.disconnect();
        return;
      }

      if (this.clientSockets[authResponse.data.id]) {
        this.clientSockets[authResponse.data.id].disconnect();
      }

      this.clientSockets[authResponse.data.id] = socket;

      const endpoint = this.handlers[path];
      const func = this.container.get(endpoint);

      // if (func) {
      await func.onSocket(authResponse.data.id, "connect");
      // }

      socket.on("message", async (data) => {
        await func.onSocket(authResponse.data.id, "message", data);
      });

      socket.on("disconnect", async () => {
        delete this.clientSockets[authResponse.data.id];
        await func.onSocket(authResponse.data.id, "disconnect");
      });

      // invoke on connection
    });

    return server;
  };

  disconnectSocket = (id) => {
    // we need to understand if this socket has any other running process on this service
    // before disconnecting

    if (this.clientSockets[id]) {
      this.clientSockets[id].disconnect();
    }
  };

  sendSocketMessage = (id, data) => {
    if (this.clientSockets[id]) {
      this.clientSockets[id].emit("message", data);
    } else if (parentPort) {
      parentPort.postMessage({
        type: "socket",
        payload: {
          id,
          data,
        },
      });
    }
  };

  processQueueRequest = async () => {
    this.Queue.process(async (payload, done) => {
      try {
        const { path, data, srcPath, token, isEvent } = payload;

        if (isEvent && this.eventManager.isSubscribed(path)) {
          await this.eventManager.invokeEvent(path, data, true);
          done();
          return;
        }

        // console.log(payload);
        const endpoint = this.handlers[path];

        if (parentPort)
          console.log("Processing queue", path, endpoint, srcPath, this.tId);
        const func = this.container.get(endpoint);
        if (func) {
          await func.handler({
            request: {},
            response: {},
            payload: data,
          });
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
      case "GET":
        return {
          path: request.query.path,
          data: request.query.data ? JSON.parse(request.query.data) : null,
        };
      case "POST":
        // Handle POST request
        if (request.headers["content-type"].includes("multipart/form-data")) {
          const { path, ...data } = request.body;
          return {
            path,
            data,
          };
        }
        return request.body;
      case "PUT":
        // Handle PUT request
        if (request.headers["content-type"].includes("multipart/form-data")) {
          const { path, ...data } = request.body;
          return {
            path,
            data,
          };
        }
        return request.body;
      case "DELETE":
        return {
          path: request.query.path,
          data: request.query.data ? JSON.parse(request.query.data) : null,
        };
      default:
        // Handle other types of requests
        return null;
    }
  };

  fetchDataFromCallback = (request) => {
    // construct path from request
    const path = request.originalUrl.split("?");
    // remove the query part of the url
    const splitPath = path[0].split("/");
    const formatedPath = `${this.service}.${splitPath[1]}.${splitPath[2]}`;

    switch (request.method) {
      case "GET":
        return {
          path: formatedPath,
          data: request.query,
        };
      case "POST":
        // Handle POST request
        return {
          path: formatedPath,
          data: request.body,
        };
      case "PUT":
        // Handle PUT request
        return {
          path: formatedPath,
          data: request.body,
        };
      case "DELETE":
        return {
          path: formatedPath,
          data: request.query,
        };
      default:
        // Handle other types of requests
        return null;
    }
  };

  processRequest = async (req, res) => {
    // console.log(this.handlers);
    // console.log('called Endpoint');

    let context = null;

    try {
      const { path, data } = this.fetchPayload(req);

      if (!path) {
        res.status(200).json({
          message: "Path not specified in payload",
          status: "error",
        });
        return;
      }

      if (!this.isLocal(path)) {
        const func = this.clientHandlers[path];
        if (func) {

          if (func.auth && !req.headers.authorization) {
            res.status(200).json({
              message: "Unauthorized Access",
              status: "unauthorized",
            });
            return;
          }

          if (func.auth && this.isGateway && this.oauthAuthorize) {
            const authResponse = await this.oauthAuthorize(req, path);
            if (authResponse.status !== "success") {
              res.status(200).json({
                message: "Unauthorized Access",
                status: "unauthorized",
              });
              return;
            }

          }
          // const newToken = `LRPC ${JSON.stringify(context)} ${req.headers.authorization}`;
          const response = await func.request(data, {
            Authorization: req.headers.authorization,
            "X-Forwarded-For": req.headers['x-forwarded-for'] || req.ip,
            "X-Forwarded-Proto": req.headers['x-forwarded-proto'], // Protocol (http/https)
            "X-Forwarded-Host": req.headers['x-forwarded-host'] || req.hostname, // Original host header
            "User-Agent": req.headers['user-agent'], // Client info (browser/app)
            "Accept-Language": req.headers['accept-language'], // Language preference
            "Content-Type": req.headers['content-type'], // Original content type
            "Accept": req.headers['accept'], // Acceptable media types
            Cookie: req.headers.cookie // Session cookies
          });
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

        if (!req.headers.authorization) {
          res.status(200).json({
            message: "Unauthorized Access",
            status: "unauthorized",
          });
          return;
        }

        const authResponse = this.authorize
          ? await this.authorize(
            req.headers.authorization,
            path,
            metadataValue
          ) : await AuthService.verify(
            req.headers.authorization,
            path,
            metadataValue
          );

        if (this.isGateway && this.oauthAuthorize) {
          const response = await this.oauthAuthorize(req, path, authResponse.data);
          if (response.status !== "success") {
            res.status(200).json(response);
            return;
          }
        }
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

      // invoke event
      if (response && response.status === 'success') {
        this.eventManager.invokeEvent(path, {
          request: data,
          response: response.data
        });
      }
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
      const resource = req.query.resource;

      if (!resource) {
        res.status(200).json({
          message: "api Resource not specified",
          status: "error",
        });
        return;
      }

      // console.log(token, secret, 'TOKEN');
      if (!token || token !== secret) {
        res.status(200).json({
          message: "Unauthorized Access",
          status: "unauthorized",
        });
        return;
      }

      try {
        const script = await fetchScriptRemote(
          this.environment,
          this,
          resource
        );
        res.status(200).json({
          message: "Fetched script",
          status: "success",
          data: script,
        });
      } catch (error) {
        res.status(200).json({
          message: "Resource does not exist",
          status: "error",
        });
      }
    } catch (error) {
      res.status(500).json({
        message: "internal server error",
      });
    }
  };

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
      })
    );
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
    });

    if (response) res.status(200).json(response);

    if (response && response.status === 'success') {
      this.eventManager.invokeEvent(path, {
        request: data,
        response: response.data
      });
    }
  };

  processEvents = async () => {

    // events
    // console.log('Processing Events', Events, Subscribers);
    const redisKeyEvent = `${this.application}-${this.environment}-events`;

    await Promise.all(Events.map(async (event) => {
      LRPCEngine.instance.redis.sadd(redisKeyEvent, event);
    }))

    //subscribers
    await Promise.all(Subscribers.map(async (subscriber) => {
      this.eventManager.registerEvent(`${subscriber}`);
    }));
  }

  processControllers = async (controllers, app) => {
    // console.log(controllers);
    await Promise.all(
      Object.keys(controllers).map(async (controller) => {
        controllers[controller].forEach(async (endpoint) => {
          // const methodKey = `${this.service}.${controller}.${endpoint.name}`;
          // console.log(endpoint.name);
          const fetchMetaKeyforCallback = Reflect.getMetadata(
            "callback",
            endpoint.prototype,
            "handler"
          );
          // console.log(fetchMetaKeyforCallback, 'META');
          if (fetchMetaKeyforCallback) {
            const path = `/${controller.replace("Controller", "")}/${endpoint.name
              }`;
            app.use(path, this.processCallbacks);
          }
          LRPCEngine.instance.container.set(endpoint.name, new endpoint());
        });
      })
    );

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

  async invokeEvent (path, data) {
    this.eventManager.invokeEvent(`${this.service}.${path}`, data);
  }
}

const LRPCAuth = (roles) => (target, name, descriptor) => {
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
          ...propAccumulator[derivedClass.name],
        };

        propAccumulator[constructor.name] = script;
      }

      let finalScript = "";
      // console.log(script, 'script')
      // replicate the class
      finalScript = `type ${constructor.name} = {
${Object.keys(script)
          .map(
            (key) => `\t${key}${script[key].optional ? "?" : ""}: ${script[key].type};`
          )
          .join("\n")}
}`;

      // console.log(finalScript);

      if (isResponse) {
        finalScript = `type ${constructor.name}={\n\tmessage: string\n\tstatus: Status\n\tdata?: {\n`;
        finalScript += `
${Object.keys(script)
            .map(
              (key) =>
                `\t\t${key}${script[key].optional ? "?" : ""}: ${script[key].type};`
            )
            .join("\n")}\n\t}\n}
  `;
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
  const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(
    propertyType.name
  );

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: isPrimitive ? propertyType.name.toLowerCase() : propertyType.name,
      optional: true,
    },
  };
};

const LRPCObjectProp = (_value, optional) => (target, key) => {
  const className = target.constructor.name;

  if (!_value || !_value.name) {
    _value = { name: "any" };
  }

  const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(
    _value.name
  );

  const finalType = isPrimitive ? _value.name.toLowerCase() : _value.name;

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: `{ [key: string]: ${finalType} }`,
      optional,
    },
  };
};

const LRPCType = (_value, optional) => (target, key) => {
  const className = target.constructor.name;

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: _value,
      optional,
    },
  };
};

const LRPCProp = (target, key) => {
  const propertyType = Reflect.getMetadata("design:type", target, key);
  const className = target.constructor.name;

  // check if the proprty type is not a primitive type
  const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(
    propertyType.name
  );

  propAccumulator[className] = {
    ...propAccumulator[className],
    [key]: {
      type: isPrimitive ? propertyType.name.toLowerCase() : propertyType.name,
      optional: false,
    },
  };
};

const LRPCSocket = (target, key) => {
  Reflect.defineMetadata("socket", "1", target, key);
  // sockcetHandlerPromises.push(async () => {
  //   // const methodName = target.constructor.name;
  //   // const path = `${LRPCEngine.instance.service}.${controller}.${methodName}`;
  //   Reflect.defineMetadata("socket", "1", target, key);
  //   // LRPCEngine.instance.socketHandlers[path] =
  // });
};

const LRPCPropArray = (type, isoptional) => (target, key) => {
  const className = target.constructor.name;

  if (type) {
    const isPrimitive = ["String", "Number", "Boolean", "Object"].includes(
      type.name
    );

    const finalType = isPrimitive ? type.name.toLowerCase() : type.name;

    propAccumulator[className] = {
      ...propAccumulator[className],
      [key]: {
        type: `${finalType}[]`,
        optional: isoptional,
      },
    };
  } else {
    propAccumulator[className] = {
      ...propAccumulator[className],
      [key]: {
        type: "any[]",
        optional: isoptional,
      },
    };
  }
};

const initWorkers = async (number, __filename) => {
  const workers = [];

  if (parentPort) return;

  if (!__filename) {
    __filename =
      process.env.NODE_ENV === "dev"
        ? `../../../src/index.ts`
        : `../../../dist/index.js`;
  }
  for (let i = 0; i < number; i++) {
    const worker = new Worker(__filename, {
      workerData: {
        id: i,
      },
    });
    worker.on("message", (message) => {
      const { type, payload } = message;
      if (type === "socket") {
        const { id, data } = payload;
        LRPCEngine.instance.sendSocketMessage(id, data);
      }
    });
    workers.push(worker);
  }
  return workers;
};

const initLRPC = (
  config,
  controllers,
  serviceClients,
  Container,
  socketConfig
) => {
  const { service, app, isGateway, corsConfig, application } = config;

  if (!process.env.SERVICEHOST) {
    console.warn(
      "Please provide a SERVICEHOST in your .env to ensure proper code generation"
    );
  }

  if (!process.env.GATEWAYURL) {
    console.warn(
      "Please provide a GATEWAYURL in your .env to ensure proper code generation"
    );
  }

  app.use(cors(corsConfig));
  // app.use(
  //   helmet.contentSecurityPolicy({
  //     directives: {
  //       defaultSrc: ["'self'"],
  //       scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com"], // Allow inline scripts and Stripe
  //       styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles if needed
  //       connectSrc: ["'self'", "https://api.stripe.com"], // Allow connections to Stripe's API
  //       frameSrc: ["'self'", "https://js.stripe.com"], // Allow iframes from Stripe
  //       imgSrc: ["'self'", "data:"], // Allow images and data URIs
  //     },
  //   })
  // );
  app.set('trust proxy', true);

  const LRPC = new LRPCEngine(
    application,
    service,
    config.authorize,
    config.oauthAuthorize,
    process.env.SERVICEHOST,
    Container,
    socketConfig,
    isGateway
  );
  LRPC.tId = workerData ? workerData.id : undefined;
  LRPC.processControllers(controllers, app);
  LRPC.processClientControllers(serviceClients);
  LRPC.processQueueRequest();

  LRPC.processEvents();

  app.use("/lrpc", upload.array("files"), LRPC.processRequest);

  app.get("/client", LRPC.fetchScript);

  createServiceClient(LRPC);
  createFEClient(LRPC);
  LRPC.eventManager.generateEvents();

  if (!parentPort) {
    if (socketConfig) {
      const server = LRPC.initSocket(app);
      server.listen(process.env.PORT, async () => {
        console.log(`Server/Websocket listening on port ${process.env.PORT}`);
        await Promise.all(sockcetHandlerPromises);
      });
    } else {
      app.listen(process.env.PORT, () => {
        console.log(`Server listening on port ${process.env.PORT}`);
      });
    }
  } else {
    Promise.all(sockcetHandlerPromises);
    // console.log(`Started service on thread ${workerData.id}`);
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
        const metadataValue = Reflect.getMetadata("auth", target, "handler");

        return {
          service,
          methodName,
          name,
          request,
          response,
          controller,
          isAuth: metadataValue,
          isMedia: Reflect.getMetadata("media", target, name),
          isSocket: Reflect.getMetadata("socket", target, name) ? true : false,
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
  LRPCSocket,
  LRPCType,
  initWorkers,
  createLRPCEvent,
  LRPCEvent,
  subScribeEvent
};
