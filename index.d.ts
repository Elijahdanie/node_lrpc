import { Request, Response, Express } from "express";
// import { RabbitMq } from "./rabbitmq";
import { Redis } from "ioredis";
import { LRPCEventType } from './logging/event.d.ts';

export interface IEndpoint {
  handler: (data: any) => Promise<any>;
  validator: (input: any) => Promise<{ message: string; status: Status }>;
}

export interface IPermission {
  limit: number;
  resources: string[];
}


export type Status =
  | "success"
  | "error"
  | "unauthorized"
  | "notFound"
  | "restricted"
  | "validationError";

export interface HandlerConfig<T, U> {
  validator: (input: T) => Promise<{ message: string; status: Status }>;
  handler: (data: LRPCRequest<T>) => Promise<BaseResponse<U>>;
  onSocket?: (id: string, status: 'connect' | 'disconnect' | 'message', data?: any) => Promise<void>;
}

export interface File {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}


export interface LRPCRequest<T> {
  request: Request;
  response: Response;
  payload: T;
  files: File[];
  context: {
    id: string;
    type: string;
    path: string;
    permissions: IPermission;
  };
}

declare class BaseResponse<T> {
  message: string;
  status: Status;
  data?: T;
}

// export interface RMQChannel {
//   sendToQueue: (queue: string, data: any) => void
//   consume: (queue, cb: (msg)=> void) => void
// }

declare class RabbitMq {
  sendToQueue: (queue: string, data: any, procedure: string) => void
  add: (data) => void
}

declare class AuthService {

  static verify: (token: string, path: string) => any;
  static verifyCustom: (token: string) => any;
  static sign: (data: any, exp?: string) => string;
}

declare class LRPCEngine {
  service: string;
  tId: string;
  url: string;
  handlers: {
    [key: string]: string;
  };
  clientHandlers: {
    [key: string]: Function;
  };
  static instance: LRPCEngine;
  static trackInstance: number;
  authorize: (
    token: string,
    role: string[]
  ) => { message: string; status: Status; data?: any };
  Queue: RabbitMq;
  redis: Redis;
  initSocket: (server: any) => void;
  isLocal: (key: string) => boolean;
  processQueueRequest: () => Promise<void>;
  processRequest: (req: Request, res: Response) => Promise<void>;
  processClientControllers: () => Promise<void>;
  processControllers: () => Promise<void>;
  sendSocketMessage (id: string, data: any ): void
  disconnectSocket (id: string ): void
  static getParameterNames(func: Function): string[];
  registerCallback: (methodKey: string, className: string) => Promise<void>;
}

declare function LRPCAuth(
  roles?: string[]
): (target: any, name: string, descriptor: PropertyDescriptor) => void;

declare function LRPCPayload(
  path: string,
  isResponse?: boolean
): <T extends { new (...args: any[]): {} }>(constructor: T) => void;

declare function initWorkers(numberOfWorkers: number, __filename: string): void;

declare function initLRPC(
  config: {
    application: string;
    service: string;
    app: Express;
    isGateway?: boolean;
    corsConfig?: {
      origin?:  boolean | string | RegExp | Array<boolean | string | RegExp> | undefined;
      methods?: string | string[] | undefined;
      allowedHeaders?: string | string[] | undefined;
      exposedHeaders?: string | string[] | undefined;
      credentials?: boolean | undefined;
      maxAge?: number | undefined;
    };
  },
  authorize: (token: string, path: string, role: string[]) => any,
  controllers?,
  serviceClients?,
  Container?,
  socketConfig?: {
    onConnection: (socketServer, socketClient) => Promise<void>;
    onDisconnection: (socketServer, socketClient, data) => Promise<void>;
  }
): LRPCEngine;

declare function LRPCPropOp (target: any, key: string): void;

/**
 * This creates a callback function in the endpoint method for clients
 * You can implement onSocket method in the endpoint for handling events from clients
 */
declare function LRPCSocket (target: any, key: string): void;

declare function LRPCProp (target: any, key: string): void;

declare function LRPCObjectProp (value: any, optional: boolean): (target: any, key: string) => void;
declare function LRPCType (value: any, optional: boolean): (target: any, key: string) => void;

declare function LRPCLimit(
  model: any,
  query?: string[]
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;

declare function LRPCResource (payloadKey?: string) : (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function genericListFetch (model: any, data: any, keyQuery: {[key: string]: any}, permissions, misc: {include?:any, select?:any, orderBy?: any} = {}): Promise<{
  data: any;
  total: any;
  page: any;
  totalPages: number;
}>

declare function LRPCPropArray(type?: {
  new (): any;
}, isoptional: boolean = false): (target: any, key: string) => void;

declare function LRPCFunction(
  controller: string,
  request: any,
  response: any,
  service?: boolean
): (target: any, name: string, descriptor: PropertyDescriptor) => void;

declare function LRPCMedia (): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function LRPCRedirect (url: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function LRPCCallback (target: any, propertyKey: string, descriptor: PropertyDescriptor): void

declare function subScribeEvent (eventType: LRPCEventType): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function LRPCEvent (controller: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

export {
  LRPCEngine,
  AuthService,
  LRPCAuth,
  LRPCPropArray,
  LRPCProp,
  BaseResponse,
  LRPCPayload,
  initLRPC,
  LRPCFunction,
  LRPCLimit,
  LRPCResource,
  genericListFetch,
  LRPCMedia,
  LRPCRedirect,
  LRPCCallback,
  LRPCPropOp,
  LRPCObjectProp,
  LRPCSocket,
  LRPCType,
  initWorkers,
  LRPCEvent,
  subScribeEvent,
  LRPCEventType
};
