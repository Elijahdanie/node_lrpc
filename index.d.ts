import { Request, Response, Express } from "express";
import { RabbitMq } from "./rabbitmq";
import { Redis } from "ioredis";

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

declare class Auth {
  
}

declare class LRPCEngine {
  service: string;
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
  isLocal: (key: string) => boolean;
  processQueueRequest: () => Promise<void>;
  processRequest: (req: Request, res: Response) => Promise<void>;
  processClientControllers: () => Promise<void>;
  processControllers: () => Promise<void>;
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

declare function initLRPC(
  config: {
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
  Container?
): LRPCEngine;

declare function LRPCProp(target: any, key: string): void;

declare function LRPCLimit(
  model: any,
  query?: string[]
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;

declare function LRPCResource (payloadKey?: string) : (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function genericListFetch (model: any, data: any, keyQuery: {[key: string]: any}, permissions, misc: {include?:any, select?:any} = {}): Promise<{
  data: any;
  total: any;
  page: any;
  totalPages: number;
}>

declare function LRPCPropArray(type?: {
  new (): any;
}): (target: any, key: string) => void;

declare function LRPCFunction(
  controller: string,
  request: any,
  response: any
): (target: any, name: string, descriptor: PropertyDescriptor) => void;

declare function LRPCMedia (): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function LRPCRedirect (url: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

declare function LRPCCallback (target: any, propertyKey: string, descriptor: PropertyDescriptor): void

export {
  LRPCEngine,
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
  LRPCCallback
};
