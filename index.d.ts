import { Request, Response, Express } from "express";
import { RabbitMq } from "./rabbitmq";
import { Redis } from "ioredis";

export interface IEndpoint {
  validator(data: any): Promise<{ message: string; status: string }>;
  handler(context: {
    request: Request;
    response: Response;
    payload: any;
    context: { id: string; type: string } | null;
  }): Promise<any>;
}

export interface Status {
  message: string;
  status: string;
  data?: any;
}

export interface LRPCEngine {
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

export interface LRPCAuth {
  (roles?: string[]): (
    target: any,
    name: string,
    descriptor: PropertyDescriptor
  ) => void;
}

export interface LRPCPayload {
  (path: string, isResponse: boolean): <T extends { new (...args: any[]): {} }>(
    constructor: T
  ) => void;
}

export interface InitLRPC {
  (
    config: {
      service: string;
      app: Express;
      port: number;
      hostname?: string;
      queueHost: string;
      redis: { host: string; port: number };
    },
    authorize: (token: string, role: string[]) => any
  ): LRPCEngine;
}

export interface LRPCFunction {
  (
    controller: string,
    request: any,
    response: any
  ): (target: any, name: string, descriptor: PropertyDescriptor) => void;
}