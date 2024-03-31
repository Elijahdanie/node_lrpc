import path from "path";
import "reflect-metadata";
import fs from "fs";
import { Request, Response, Express } from "express";
import Container from "typedi";
import { IEndpoint, Status } from "./types";
import {
  typeLibrary,
  serviceHandlerPromises,
  createServiceClient,
  createFEClient,
} from "./bin/clientGenerator";
import { RabbitMq } from "./rabbitmq";
import { Redis } from "ioredis";

export class LRPCEngine {
  service: string;
  url: string;
  handlers: {
    [key: string]: string;
  } = {};
  clientHandlers: {
    [key: string]: Function;
  } = {};
  static instance: LRPCEngine;
  static trackInstance: number = 0;
  authorize: (
    token: string,
    role: string[]
  ) => { message: string; status: Status; data?: any };
  Queue: RabbitMq;
  redis: Redis;

  constructor(
    service: string,
    authorize: (
      token: string,
      role: string[]
    ) => { message: string; status: Status; data?: any },
    url: string,
    queueHost: string,
    redis: { host: string; port: number }
  ) {
    if (LRPCEngine.instance) {
      throw new Error("Cannot create multiple instances of LRPCEngine");
    }
    this.url = url;
    this.service = service;

    try {
      this.Queue = new RabbitMq(service, { server: { host: queueHost } });
    } catch (error) {
      console.log(error);
    }

    this.redis = new Redis(redis);
    this.authorize = authorize;
    LRPCEngine.instance = this;
    LRPCEngine.trackInstance++;
    // console.log('CREATED INSTANCE');
  }

  isLocal = (key: string) => {
    return key.split(".")[0] === this.service;
  };

  processQueueRequest = async () => {
    this.Queue.process(async ({ payload }, done) => {
      const { path, data, srcPath, token } = payload;
      const endpoint = this.handlers[path];
      const func: any = Container.get(endpoint);
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

  processRequest = async (req: Request, res: Response) => {
    // console.log(this.handlers);
    // console.log('called Endpoint');
    try {
      const { path, data } = req.body;

      if (!this.isLocal(path)) {
        // console.log(path);
        const func = this.clientHandlers[path];
        // console.log(func, 'FUNCTION', this.clientHandlers);
        if (func) {
          const response = await func(data, req.headers.authorization);
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

      let context: { id: string; type: string } = null;

      const classInstance: IEndpoint = Container.get(className);

      const metadataValue = Reflect.getMetadata(
        "auth",
        classInstance,
        "handler"
      );
      // console.log(metadataValue);

      if (metadataValue) {
        const authResponse = LRPCEngine.instance.authorize(
          req.headers.authorization,
          metadataValue
        );

        if (authResponse.status !== "success") {
          res.status(200).json(authResponse);
          return;
        }

        context = authResponse.data;
      }

      let isValid = { message: "", status: "" };

      try {
        isValid = await classInstance.validator(data);
      } catch (error) {
        console.log(error);
        res.status(200).json({
          message: (error as any).message,
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
        message: (error as any).message,
        status: "error",
        // data: null
      });
    }
  };

  processClientControllers = async () => {
    const controllerPath = `./src/serviceClients`;

    if(!fs.existsSync(controllerPath)){
        return;
    }
    const fileContents = fs.readdirSync(controllerPath);

    await Promise.all(
      fileContents.map(async (data) => {
        const targetPath = `${controllerPath}/${data}`;
        // console.log(targetPath);
        const fileName = data.split(".")[0];
        if (fileName !== this.service) {
          const dynamicImport = await import(path.resolve(targetPath));
          Object.keys(dynamicImport).forEach((key) => {
            // console.log(controller);
            if (!["request", "queue"].includes(key)) {
              Object.keys(dynamicImport[key]).map((endpoint) => {
                const methodKey = `${fileName}.${key}.${endpoint}`;
                // console.log(dynamicImport[key][endpoint]);
                this.clientHandlers[methodKey] =
                  dynamicImport[key][endpoint].request;
              });
            }
          });
        }
      })
    );
  };

  processControllers = async () => {
    const controllerPath = `./src/controllers`;
    const fileContents = fs.readdirSync(controllerPath);

    // make a dynamic import

    // console.log(fileContents);

    await Promise.all(
      fileContents.map(async (data) => {
        const targetPath = `${controllerPath}/${data}/index.ts`;
        const dynamicImport = await import(path.resolve(targetPath));
        // console.log(dynamicImport[`${data}Controller`]);
        const endpoints: any = dynamicImport[`${data}Controller`];
        endpoints.forEach((endpoint) => {
          Container.set(endpoint.name, new endpoint());
          // const check = Container.get(endpoint.name);
          // console.log(endpoint.name, check);
        });
      })
    );

    // console.log('instance', LRPCEngine.trackInstance);
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

export const LRPCAuth =
  (roles?: string[]) =>
  (target: any, name: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata("auth", roles ? roles : "regular", target, name);
  };

export const LRPCPayload =
  (path: string, isResponse: boolean = false) =>
  <T extends { new (...args: any[]): {} }>(constructor: T) => {
    // Create an instance of the class
    const instance = new constructor();

    let script = `
    class ${constructor.name} {\n`;
    // Get the type of each property and log it
    if (!isResponse) {
      for (const key in instance) {
        if (instance.hasOwnProperty(key)) {
          const propertyType = typeof instance[key];
          const property = `\t${key}?: ${propertyType}`;
          // console.log(`Property '${key}' has type '${propertyType}'`);
          script += `\t${property}\n`;
        }
      }
    } else {
      let data = `\t\tmessage: string\n\t\tstatus: Status\n\t\tdata?: {\n`;
      for (const key in instance) {
        if (instance.hasOwnProperty(key)) {
          let propertyType = typeof instance[key];
          let propertyName = `${propertyType}`;
          if (propertyType === "object") {
            propertyName = key;
            console.log(instance[key].constructor.name);
          }
          const property = `\t${key}?: ${propertyType}`;
          // console.log(`Property '${key}' has type '${propertyType}'`);
          data += `\t\t${property}\n`;
        }
      }
      data += `\t\t}`;
      script += data;
    }

    script += `\n\t}`;

    if (!typeLibrary[path]) {
      typeLibrary[path] = {};
    }
    typeLibrary[path][constructor.name] = script;
    // console.log(script, path);
  };

export const initLRPC = (
  config: {
    service: string;
    app: Express;
    port: number;
    hostname?: string;
    queueHost: string;
    redis: { host: string; port: number };
  },
  authorize: (token: string, role: string[]) => any
) => {
  const { service, app, port, hostname } = config;
  const url = hostname
    ? `https://${hostname}/lrpc`
    : `http://localhost:${port}/lrpc`;
  const LRPC = new LRPCEngine(service, authorize, url, config.queueHost, config.redis);
  LRPC.processControllers();
  LRPC.processClientControllers();
  LRPC.processQueueRequest();

  app.use("/lrpc", LRPC.processRequest);

  createServiceClient(url);
  createFEClient(url);

  app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
  });

  return LRPC;
};

export const LRPCFunction =
  (controller: string, request: any, response: any) =>
  (target: any, name: string, descriptor: PropertyDescriptor) => {
    serviceHandlerPromises.push(async () => {
      // const paramNames = LRPCEngine.getParameterNames(descriptor.value);

      let methodName = target.constructor.name;
      const methodKey = `${LRPCEngine.instance.service}.${controller}.${methodName}`;
      await LRPCEngine.instance.registerCallback(methodKey, methodName);

      return {
        methodName,
        name,
        request,
        response,
        controller,
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
