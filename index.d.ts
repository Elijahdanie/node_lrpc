import { Request, Response, Express } from "express";
import { RabbitMq } from "./rabbitmq";
import { Redis } from "ioredis";

export interface IEndpoint {
    handler: (data: any)=>Promise<any>
    validator: (input: any)=>Promise<{message: string, status: Status}>
}

export type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';

export interface HandlerConfig<T, U> {
    validator: (input: T)=>Promise<{message: string, status: Status}>
    handler: (data: LRPCRequest<T>)=>Promise<BaseResponse<U>>
}

export interface LRPCRequest<T> {
    request: Request
    response: Response
    payload: T,
    context: {
        id: string
        type: string
        path: string
        permission: string
    }
}

declare class BaseResponse<T> {
    message: string
    status: Status
    data?: T
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

declare function LRPCAuth 
  (roles?: string[]): (
    target: any,
    name: string,
    descriptor: PropertyDescriptor
  ) => void;

declare function LRPCPayload (path: string, isResponse?: boolean): <T extends { new (...args: any[]): {} }>(
    constructor: T
  ) => void;

declare function initLRPC (
    config: {
      service: string;
      apiGateWay: string;
      app: Express;
      port: number;
      hostname?: string;
      rabbitmqUrl: string;
      redis: { host: string; port: number };
    },
    authorize: (token: string, path: string, role: string[]) => any,
    controllers?,
    serviceClients?,
    Container?
  ): LRPCEngine;

declare function LRPCProp (target: any, key: string): void;

declare function LRPCPropArray (type?: { new (): any }): (
    target: any,
    key: string
  ) => void;

declare function LRPCFunction 
  (
    controller: string,
    request: any,
    response: any
  ): (target: any, name: string, descriptor: PropertyDescriptor) => void;

export {LRPCEngine, LRPCAuth, LRPCPropArray, LRPCProp, BaseResponse, LRPCPayload, initLRPC, LRPCFunction}