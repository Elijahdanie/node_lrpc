import { Request, Response, Express } from "express";
// import { RabbitMq } from "./rabbitmq";
import { Redis } from "ioredis";
import { LRPCEventType } from './logging/event.d.ts';


/**
 * IEndpoint interface
 */
export interface IEndpoint {
  handler: (data: any) => Promise<any>;
  validator: (input: any) => Promise<{ message: string; status: Status }>;
}

/**
 * Permission interface
 * limit: number
 * resources: string[]
 */
export interface IPermission {
  limit: number;
  resources: string[];
}

/**
 * Response Status
 */
export type Status =
  | "success"
  | "error"
  | "unauthorized"
  | "notFound"
  | "restricted"
  | "validationError";


  /**
   * Endpoint class Handler interface
   */
export interface HandlerConfig<T, U> {

  /**
   * This function handles request data validation
   * @param input The request payload
   * @returns A message and a status
   */
  validator: (input: T) => Promise<{ message: string; status: Status }>;

  /**
   * This endpoint handles the request after validation has occurred
   * Takes in the express request object and returns a response
   * There's a context object wuth type, id, path and permissions
   * The id refers to user Id, path refers to the procedure,
   * The permissions refer to the user's permissions as specified in IPermission interface
   * @param data The payload request
   * @returns A response with generic type U as especified in the endpoint
   */
  handler: (data: LRPCRequest<T>) => Promise<BaseResponse<U>>;

  /**
   * This function is called when the socket is connected, disconnected or message received
   * @param id The socket id
   * @param status The status of the socket
   * @param data The data received
   */
  onSocket?: (id: string, status: 'connect' | 'disconnect' | 'message', data?: any) => Promise<void>;
}

/**
 * File interface
 */
export interface File {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

/**
 * LRPCRequest interface
 * This interface is used to pass data between the endpoint and the handler
 * @param T The type of the payload
 * @param U The type of the response
 */
export interface LRPCRequest<T> {

  /**
   * The express request object
   */
  request: Request;

  /**
   * The express response object
   */
  response: Response;

  /**
   * The payload of the request
   */
  payload: T;

  /**
   * The files uploaded by the user
   */
  files: File[];

  /**
   * The context of the request
   */
  context: {

    /**
     * The user id
     */
    id: string;

    /**
     * The type of the request
     */
    type: string;

    /**
     * The path/procedure of the request
     */
    path: string;

    /**
     * The permissions of the user
     */
    permissions: IPermission;
  };
}

/**
 * BaseResponse interface
 * This interface is used to return a response from an endpoint
 * @param T The type of the response
 */
declare class BaseResponse<T> {
  message: string;
  status: Status;
  data?: T;
}


/**
 * RabbitMq class
 */
declare class RabbitMq {

  /**
   * This function sends a message to a queue
   * @param queue The queue to send the message to
   * @param data The data to send
   * @param procedure The procedure to send the message to
   */
  sendToQueue: (queue: string, data: any, procedure: string) => void

  /**
   * This function adds a message to a queue
   * @param data The data to add
   */
  add: (data) => void
}

/**
 * AuthService class
 */
declare class AuthService {

  /**
   * This function verifies a token
   * @param token The token to verify
   * @param path The path/procedure of the request to verify the token for
   * @returns The decoded token
   */
  static verify: (token: string, path: string) => any;

  /**
   * This function verifies a token with custom jwt secret
   * @param token The token to verify
   * @returns The decoded token
   */
  static verifyCustom: (token: string, secret: string) => any;

  /**
   * This function signs a token
   * @param data The data to sign
   * @param exp The expiration date of the token
   * @returns The signed token
   */
  static sign: (data: any, exp?: string) => string;

  /**
   * This function signs the token with a custom secret
   * @param data The data to sign
   * @param secret The secret to sign the token with
   * @param exp The expiration date of the token
   * @returns The signed token
   */
  static signCustom: (data: any, secret: string, exp?: string) => string;
}

/**
 * This class is the main class of the LRPC library
 */
declare class LRPCEngine {

  /**
   * The service name of the service
   */
  service: string;

  /**
   * The thread Id of the service for multithreaded services
   */
  tId: string;

  /**
   * The url of the service
   */
  url: string;

  /**
   * The callback handler Object for endpoints
   */
  handlers: {
    [key: string]: string;
  };

  /**
   * The callback handlers for serviceClient endpoints
   */
  clientHandlers: {
    [key: string]: Function;
  };

  /**
   * The static instance of the LRPCEngine
   */
  static instance: LRPCEngine;

  /**
   * Tracks the number of instances of the LRPCEngine to limit the number of instances
   */
  static trackInstance: number;

  /**
   * This function authorizes the user based on the token and roles
   * @param token The token to authorize
   * @param role The roles to authorize
   * @returns The authorization response
   */
  authorize: (
    token: string,
    role: string[]
  ) => { message: string; status: Status; data?: any };

  /**
   * The RabbitMq instance
   */
  Queue: RabbitMq;

  /**
   * The Redis instance
   */
  redis: Redis;

  /**
   * This function initializes the socket server
   * @param server The socket server
   */
  initSocket: (server: any) => void;

  /**
   * This function checks if the procedure is local or not
   * @param key The key to check
   * @returns True if the key is local, false otherwise
   */
  isLocal: (key: string) => boolean;

  /**
   * This function processes the rmq request
   * @returns A promise that resolves when the queue request is processed
   */
  processQueueRequest: () => Promise<void>;

  /**
   * This function processes http requests
   * @param req The http request
   * @param res The http response
   * @returns A promise that resolves when the request is processed
   */
  processRequest: (req: Request, res: Response) => Promise<void>;
  
  /**
   * This function processes service client controllers
   * @returns A promise that resolves when the client controllers are processed
   */
  processClientControllers: () => Promise<void>;

  /**
   * This function processes the local controllers
   * @returns A promise that resolves when the controllers are processed
   */
  processControllers: () => Promise<void>;

  /**
   * This function sends a message to a socket
   * @param id The socket id
   * @param data The data to send
   */
  sendSocketMessage (id: string, data: any ): void

  /**
   * This function disconnects a socket
   * @param id The socket id
   */
  disconnectSocket (id: string ): void
  
  static getParameterNames(func: Function): string[];
  registerCallback: (methodKey: string, className: string) => Promise<void>;
  invokeEvent: (path, data) => Promise<void>
}

/**
 * This decorator is used to add Authorization to an endpoint
 * @param roles The roles to authorize
 * @returns The authorization decorator
 */
declare function LRPCAuth(
  roles?: string[]
): (target: any, name: string, descriptor: PropertyDescriptor) => void;

/**
 * This decorator is used to mark a class as part of the type definition in the payload or response
 * of an endpoint
 * @param path The path of the endpoint
 * @param isResponse Whether the endpoint is a response or not
 * @returns The payload decorator
 */
declare function LRPCPayload(
  path: string,
  isResponse?: boolean
): <T extends { new (...args: any[]): {} }>(constructor: T) => void;

/**
 * This function is used to spin up multiple workers for the service
 * @param numberOfWorkers The number of workers to spin up
 * @param __filename The __filename of the index file
 * @returns void
 */
declare function initWorkers(numberOfWorkers: number, __filename: string): void;

/**
 * This function is used to initialize the LRPC engine
 * @param config The configuration object
 * @returns The LRPCEngine instance
 */
declare function initLRPC(

  /**
   * The configuration object
   */
  config: {
    /**
     * The application name
     */
    application: string;

    /**
     * The service name
     */
    service: string;

    /**
     * The express app
     */
    app: Express;

    /**
     * Whether the service is a gateway or not
     */
    isGateway?: boolean;

    /**
     * The cors configuration
     */
    corsConfig?: {
      origin?:  boolean | string | RegExp | Array<boolean | string | RegExp> | undefined;
      methods?: string | string[] | undefined;
      allowedHeaders?: string | string[] | undefined;
      exposedHeaders?: string | string[] | undefined;
      credentials?: boolean | undefined;
      maxAge?: number | undefined;
    };
    authorize?: ((token: string, path: string, role: string[]) => Promise<{message: string, status: Status, data: any}>);
    oauthAuthorize?: (request: Request, path: string, decoded: any) => Promise<{message: string, status: Status}>;
  },
  /**
   * Local controllers
   */
  controllers?,
  /**
   * other services controllers
   */
  serviceClients?,
  /**
   * Dependency injection container
   */
  Container?,
  /**
   * socket config
   */
  socketConfig?: {
    onConnection: (socketServer, socketClient) => Promise<void>;
    onDisconnection: (socketServer, socketClient, data) => Promise<void>;
  }
): LRPCEngine;

/**
 * This decorator is used to mark a field in a LrpcPayload as optional
 * @param target
 * @param key
 */
declare function LRPCPropOp (target: any, key: string): void;

/**
 * This decorator is used to mark an endpoint as a socket endpoint
 */
declare function LRPCSocket (target: any, key: string): void;

/**
 * This decorator is used to mark a field in a LrpcPayload as required
 * @param target
 * @param key
 */
declare function LRPCProp (target: any, key: string): void;

/**
 * This decorator is used to decorate a field with object type definitions
 * example usage:
 * LRPCObjectProp({ name: "any" }, false)
 * fieldName: { name: "any" }
 * @param value
 * @param optional
 */
declare function LRPCObjectProp (value: any, optional: boolean): (target: any, key: string) => void;

/**
 * This decorator is used to decorate a field with any custom type definitions not avaliable in the library
 * like enumerations, unions, etc.
 * example usage:
 * LRPCType(`'start' | 'stop' | 'pause' | 'resume'`, false)
 * fieldName: 'start' | 'stop' | 'pause' | 'resume'
 * @param value 
 * @param optional 
 */
declare function LRPCType (value: any, optional: boolean): (target: any, key: string) => void;

/**
 * This decorator is used specify which model and what query should be used to apply limit in user permissions
 * example usage:
 * if user permissions is 
 * permission: {
 *  limit: 10,
 *  resources: []
 * }
 * @LRPCLimit(User, ['userId', 'id'])
 * so in payload
 * {
 *    id: '123'
 * }
 * the query will be 
 * prisma.model.count{
 *    where: {
 *      userId: '123'
 * }
 * The first index in the array specifies the database property you want to use in the query
 * and the second argument is the name of the property in the payload that carries the result 
 * of the database property you want to use to limit the query
 * if nothing is provided it uses the id in the context object of the request.
 * @param model The prisma model to make use of
 * @param query The query to be used for fetching list e.g {
 * id: string, name: string
 * }
 */
declare function LRPCLimit(
  model: any,
  query?: string[]
): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void;


/**
 * This endpoint limits users to a specific sets of resource
 */
declare function LRPCResource (payloadKey?: string) : (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

/**
 * 
 * @param model The prisma model to make use of
 * @param data The data to be used for fetching list e.g {
 * page: string, limit: string, search: string
 * }
 * @param keyQuery The query to be used for fetching list e.g {
 * id: string, name: string
 * }
 * @param permissions The permissions to be used for fetching, reference IPermission interface
 * @param misc These are the prisma options e.g {
 * include: string, select: string, orderBy: string
 * }
 * @returns The list of data
 */
declare function genericListFetch (model: any, data: any, keyQuery: {[key: string]: any}, permissions: IPermission, misc: {include?:any, select?:any, orderBy?: any} = {}): Promise<{
  data: any;
  total: any;
  page: any;
  totalPages: number;
}>

/**
 * 
 * @param type The type of the array
 * @param isoptional Is the array optional
 * @returns void
 */
declare function LRPCPropArray(type?: {
  new (): any;
}, isoptional: boolean = false): (target: any, key: string) => void;

/**
 * This decorator is used to mark a class as a function endpoint
 * @param controller The controller name
 * @param request The request class
 * @param response The response class
 * @param service Is the endpoint a service only endpoint which means it won't be exposed to the client scripts
 * @returns The function endpoint decorator
 */
declare function LRPCFunction(
  controller: string,
  request: any,
  response: any,
  service?: boolean
): (target: any, name: string, descriptor: PropertyDescriptor) => void;

/**
 * This decorator is used to mark a field in a LrpcPayload as media
 * This injects the file property into the request as specified in
 * LRPCRequest interface
 * example usage:
 * LRPCMedia()
 * fieldName: string
 */
declare function LRPCMedia (): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

/**
 * This decorator is used to mark a field in a LrpcPayload as a redirect
 * example usage:
 * LRPCRedirect('https://google.com')
 * @LRPCAuth()
 * @LRPCFunction(controller, sampleRequest, sampleResponse)
 * async handler(data: LRPCRequest<sampleRequest>): Promise<BaseResponse<sampleRequest>> {}
 */
declare function LRPCRedirect (url: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

/**
 * This decorator is used to mark a field in a LrpcPayload as a callback
 * This spreads the endpoint and makes the url to be /controller/endpoint
 * rather than send it as a procedure in body of request as 
 * {
 *  path: 'service.controller.endpoint',
 *  data: {
 *      // data
 * }
 * LRPCCallback('https://google.com')
 * @LRPCAuth()
 * @LRPCFunction(controller, sampleRequest, sampleResponse)
 * async handler(data: LRPCRequest<sampleRequest>): Promise<BaseResponse<sampleRequest>> {}
 */
declare function LRPCCallback (target: any, propertyKey: string, descriptor: PropertyDescriptor): void


/**
 * This decorator is used to subscribe to an event
 * @param eventType The event type to subscribe to
 */
declare function subScribeEvent (eventType: LRPCEventType): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

/**
 * This decorator is used to mark the handler function of an endpoint class as an event
 * @param controller The controller name
 */
declare function LRPCEvent (controller: string): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => void

/**
 * This function creates an event
 * @param event The event to create
 */
declare function createLRPCEvent (event): Promise<void>

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
  createLRPCEvent,
  LRPCEventType
};
