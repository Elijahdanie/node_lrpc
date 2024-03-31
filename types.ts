import { Request, Response } from "express"


/**
 * This defines all the needed values for an endpoint
 * @param T - The type of the payload
 * @param U - The type of the response
 * @param procedure - The name of the procedure
 * @param validator - The function that validates the payload
 * @param handler - The function that handles the payload
 */
export interface HandlerConfig<T, U> {
    validator: (input: T)=>Promise<{message: string, status: Status}>
    handler: (data: LRPCRequest<T>)=>Promise<BaseResponse<U>>
}

export interface LRPCRequest<T> {
    request: Request
    response: Response
    payload: T
}

export class BaseResponse<T> {
    message: string
    status: Status
    data?: T
}

export class BaseEndpoint {
    
    // static path (): string {
    //     let dir = __dirname.split('/');
    //     let path = dir[dir.length - 1];
    //     return path;
    // }
}

export interface IEndpoint {
    handler: (data: any)=>Promise<any>
    validator: (input: any)=>Promise<{message: string, status: Status}>
}

export interface IController {
    resolveEndPoints(procedures: any, router: any): Promise<any>
}

export type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted';
//     success = 'success',
//     error = 'error',
//     unauthorized = 'unauthorized',
//     notFound = 'notFound',
//     restricted = 'restricted'
// }