import fs from 'fs';


export const createController = (controller: string) => {
    const controllerFolder = `src/controllers`;

    if(!fs.existsSync('./src')){
        fs.mkdirSync('./src');
    }

    if(!fs.existsSync(controllerFolder)){
        fs.mkdirSync(controllerFolder);
    }

    const controllerPath = `${controllerFolder}/${controller}`;

    if(!fs.existsSync(controllerPath)){
        fs.mkdirSync(controllerPath);
    } else {
        console.log('Controller already exists');
        return;
    }

    const endpointsPath = `${controllerPath}/endpoints`;
    if(!fs.existsSync(endpointsPath)){
        fs.mkdirSync(endpointsPath);
    }

    const endpoints = [`${controller}Create`, `${controller}Update`, `${controller}Fetch`, `${controller}Delete`];

    const imports = endpoints.map(endpoint => {
        return `import { ${endpoint} } from './endpoints/${endpoint}';`
    });

    const controllerIndex = `
${imports.join('\n')}

export const ${controller}Controller = [${endpoints.join(', ')}];
`

    fs.writeFileSync(`${controllerPath}/index.ts`, controllerIndex);

    [`${controller}Create`, `${controller}Update`, `${controller}Fetch`, `${controller}Delete`].forEach(endpoint => {
        const endpointPath = `${controllerPath}/endpoints/${endpoint}.ts`;
        const endpointContent = createEndpoint(controller, endpoint);
        fs.writeFileSync(endpointPath, endpointContent);
    });

    const repositoryPath = `${controllerPath}/${controller}Repository.ts`;
    createRepository(controller, repositoryPath, endpoints, endpoints);
}

export const createEndpoint = (controller: string, endpoint: string) => {

    const requestClass = `${endpoint}Request`;
    const responseClass = `${endpoint}Response`;
    const repository = `${controller}Repository`;

    return`
import { LRPCFunction, LRPCPayload } from "../../../lrpc/engine";
import { BaseResponse, HandlerConfig, LRPCRequest, Status, IEndpoint } from "../../../lrpc/types";
import ${repository} from "../${repository}";
import Container, {Service} from "typedi";


const controller = '${controller}';

/**
 * This is the request class for the ${endpoint} endpoint.
 */
@LRPCPayload(controller)
export class ${requestClass} {

}

/**
 * This is the response class for the ${endpoint} endpoint.
 */
@LRPCPayload(controller, true)
export class ${responseClass} {

}

/**
 * This class handles request for the ${endpoint} endpoint.
 */
@Service()
export class ${endpoint} implements HandlerConfig<${requestClass}, ${responseClass}> {


    _${controller}Repository: ${controller}Repository;
    constructor(){
        this._${controller}Repository = Container.get(${controller}Repository);
    }

    /**
     * This is the validator for the ${endpoint} endpoint.
     * @param input
     * @returns Boolean
     */
    async validator (input: ${requestClass}): Promise<{message: string, status: Status}> {

        // Add your validation logic here

        return {
            message: 'Validated successfully',
            status: 'success',
        };
    }

    /**
     * This is the handler for the ${endpoint} endpoint.
     * @param data
     * @returns BaseResponse<${responseClass}>
     */
    @LRPCFunction(controller, ${requestClass}, ${responseClass})
    async handler(data: LRPCRequest<${requestClass}>): Promise<BaseResponse<${responseClass}>> {

        
        try {
            const response = await this._${repository}.${endpoint}(data.payload);
            return {
                message: 'created successfully.',
                status: 'success',
                data: response
            }
        } catch (error) {
            console.log(error);
            return {
                message: (error as any).message,
                status: 'error'
            }
        }

        return {} as BaseResponse<${responseClass}>;
    }
}
`
}

export const createRepository = (controller: string, path: string, endpoints: string[], imports: string[]) => {
    let payloads = imports.map(endpoint => {
        return `import { ${endpoint}Request, ${endpoint}Response } from './endpoints/${endpoint}';`
    });
    const repositoryContent = `
${payloads.join('\n')}
import { Service } from 'typedi';
import { prisma } from '../..';

@Service()
export default class ${controller}Repository {

        ${endpoints.map(endpoint => {
            return `
    ${endpoint} = async (data: ${endpoint}Request): Promise<${endpoint}Response> => {
        
        // Add your business logic here
        
        return {} as ${endpoint}Response;
    }
            `
        }).join('')}
    }
`
        fs.writeFileSync(path, repositoryContent);
}


const controller = process.argv[2];
const endpoint = process.argv[3];

console.log(controller, endpoint);

if(controller && !endpoint){
    createController(controller);
} else if(endpoint && controller){
    const controllerPath = `src/controllers/${controller}`;
    if(!fs.existsSync(controllerPath)){
        console.log('Controller does not exist');
    } else {
        if(!fs.existsSync(`${controllerPath}/endpoints`)){
            fs.mkdirSync(`${controllerPath}/endpoints`);
        }
        const endpointPath = `${controllerPath}/endpoints/${endpoint}.ts`;
        const endpointContent = createEndpoint(controller, endpoint);
        fs.writeFileSync(endpointPath, endpointContent);
        console.log('Endpoint created successfully');
    }
}
