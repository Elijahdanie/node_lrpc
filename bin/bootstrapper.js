const fs = require('fs');
const { service } = require('../../../lrpc.config');


const createController = (controller, endpointsList) => {
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

    console.log(endpointsList, 'ENDPOINTS');

    const endpoints = endpointsList.length === 0 ? [`${controller}Create`, `${controller}Update`, `${controller}Fetch`, `${controller}Delete`]
    : endpointsList

    const imports = endpoints.map(endpoint => {
        return `import { ${endpoint} } from './endpoints/${endpoint}';`
    });

    const controllerIndex = `
${imports.join('\n')}

export const ${controller}Controller = [
    ${endpoints.join(',\n\t')}
];
`

    fs.writeFileSync(`${controllerPath}/index.ts`, controllerIndex);

    

    endpoints.forEach(endpoint => {
        const endpointPath = `${controllerPath}/endpoints/${endpoint}.ts`;
        const endpointContent = createEndpoint(controller, endpoint);
        fs.writeFileSync(endpointPath, endpointContent);
    });

    const repositoryPath = `${controllerPath}/${controller}Repository.ts`;
    createRepository(controller, repositoryPath, endpoints, endpoints);
    generateRegistry();
    createUnitTests(controller);
}

const createEndpoint = (controller, endpoint) => {

    const requestClass = `${endpoint}Request`;
    const responseClass = `${endpoint}Response`;
    const repository = `${controller}Repository`;

    return`
import {LRPCProp, LRPCPropOp, LRPCAuth, LRPCFunction, LRPCPayload } from "node_lrpc";
import { BaseResponse, HandlerConfig, LRPCRequest, Status, IEndpoint } from "node_lrpc";
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
    @LRPCAuth()
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

const createRepository = (controller, path, endpoints, imports) => {
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

const generateRegistry = ()=>{
const controllerPath = './src/controllers';
const registeryPath = './src/lrpc/registery.ts';
const files = fs.readdirSync(controllerPath).filter(f=>f !== '.DS_Store');
// console.log(files);
    const script = `
// Automatically generated by lrpc, do not edit
${files.map(file=>{
        const fileName = file.split('.')[0];
        return `\nimport { ${fileName}Controller } from '../controllers/${fileName}';`;
    }).join('')}
import serviceClients from './serviceClients';
    
    
    
const controllers = {
    ${files.map(file=>{
        const fileName = file.split('.')[0];
        return `${fileName}Controller`
    }).join(',\n\t')}
}
    

export {controllers, serviceClients};
    
`
    fs.writeFileSync(registeryPath, script);
    console.log(registeryPath);

}

const createUnitTests = (controller)=>{
    const endpointsPath = `./src/controllers/${controller}/endpoints`;
    const endpoints = fs.readdirSync(endpointsPath).filter(f=>f !== '.DS_Store').map(f=>f.split('.')[0]);
    const testPath = `./src/tests/${controller}.ts`;
    if(!fs.existsSync('./src/tests')){
        fs.mkdirSync('./src/tests');
    }
    console.log(__dirname);
const testContent = `
// modify import to specify the service
import { ${controller} } from '../lrpc/clientsFE/${service}';

export const ${controller}Test = () => {
    ${endpoints.map(endpoint=>{
    return `
    describe('Testing the endpoint ${endpoint}', () => {
        
        it("Should Do Something", async () => {

            const response = await ${controller}.${endpoint}({
                // Add your test data here
            } as any);

            expect(response.status).toBe('success');
        })
    })
    `
}).join('')}
}
`

fs.writeFileSync(testPath, testContent);
}

module.exports = {
    createController,
    createEndpoint,
    createRepository,
    generateRegistry,
    createUnitTests
}