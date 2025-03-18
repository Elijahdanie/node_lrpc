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

    resolveControllerIndex(controller, endpoints, controllerPath);
    

    endpoints.forEach(endpoint => {
        const endpointPath = `${controllerPath}/endpoints/${endpoint}.ts`;
        const endpointContent = createEndpoint(controller, endpoint);
        fs.writeFileSync(endpointPath, endpointContent);
    });

    const repositoryPath = `${controllerPath}/${controller}Repository.ts`;
    createRepository(controller, repositoryPath, endpoints);
    generateRegistry();
    createUnitTests(controller);
}


const resolveControllerIndex = (controller, endpoints, controllerPath) => {
    const filePath = `${controllerPath}/index.ts`;

    if (!fs.existsSync(filePath)) {
        // First run: Create the controller index file
        console.log(`Creating new controller index: ${filePath}`);

        const imports = endpoints.map(endpoint => `import { ${endpoint} } from './endpoints/${endpoint}';`);

        const controllerIndex = `
${imports.join('\n')}

export const ${controller}Controller = [
    ${endpoints.join(',\n\t')},
];
        `;

        fs.writeFileSync(filePath, controllerIndex.trim());
        console.log(`Controller index created successfully!`);
        return;
    }

    // If file exists, update it
    console.log(`Updating existing controller index: ${filePath}`);

    let fileContent = fs.readFileSync(filePath, 'utf8');

    let existingImports = new Set(fileContent.match(/import { .*? } from '.*?';/g) || []);
    let existingEndpoints = new Set(fileContent.match(/\b\w+\b(?=\s*,|\s*\])/g) || []);

    endpoints.forEach(endpoint => {
        const importStatement = `import { ${endpoint} } from './endpoints/${endpoint}';`;

        if (!existingImports.has(importStatement)) {
            fileContent = importStatement + '\n' + fileContent;
        }

        if (!existingEndpoints.has(endpoint)) {
            const insertPosition = fileContent.lastIndexOf(']');
            fileContent = fileContent.slice(0, insertPosition) + `\t${endpoint},\n]`;
        }
    });

    fs.writeFileSync(filePath, fileContent.trim());
    console.log(`Controller index updated successfully!`);
};


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

// const createRepository = (controller, path, endpoints) => {
//     let payloads = endpoints.map(endpoint => {
//         return `import { ${endpoint}Request, ${endpoint}Response } from './endpoints/${endpoint}';`
//     });
//     const repositoryContent = `
// ${payloads.join('\n')}
// import { Service } from 'typedi';
// import { prisma } from '../..';

// @Service()
// export default class ${controller}Repository {

//         ${endpoints.map(endpoint => {
//             return `
//     ${endpoint} = async (data: ${endpoint}Request): Promise<${endpoint}Response> => {

//         try {
//             // Add your business logic here
            
//             return {} as ${endpoint}Response;
//         } catch (error: any) {
//             console.error(error);
//             throw new Error(error.message);
//         }
//     }
//             `
//         }).join('')}
// }
// `
//         fs.writeFileSync(path, repositoryContent);
// }


const createRepository = (controller, filePath, endpoints) => {
    if (!fs.existsSync(filePath)) {
        // First run: Create a new repository file
        console.log(`Creating new repository: ${filePath}`);

        let payloads = endpoints.map(endpoint => {
            return `import { ${endpoint}Request, ${endpoint}Response } from './endpoints/${endpoint}';`;
        });

        const repositoryContent = `
${payloads.join('\n')}
import { Service } from 'typedi';
import { prisma } from '../..';

@Service()
export default class ${controller}Repository {

    ${endpoints.map(endpoint => `
    ${endpoint} = async (data: ${endpoint}Request): Promise<${endpoint}Response> => {
        try {
            // Add your business logic here
            
            return {} as ${endpoint}Response;
        } catch (error: any) {
            console.error(error);
            throw new Error(error.message);
        }
    }`).join('\n')}
}
        `;

        fs.writeFileSync(filePath, repositoryContent.trim());
        console.log(`Repository created successfully!`);
        return;
    }

    // If file exists, update it
    console.log(`Updating existing repository: ${filePath}`);

    let fileContent = fs.readFileSync(filePath, 'utf8');

    let imports = new Set(fileContent.match(/import { .*? } from '.*?';/g) || []);

    endpoints.forEach(endpoint => {
        const importStatement = `import { ${endpoint}Request, ${endpoint}Response } from './endpoints/${endpoint}';`;

        if (!imports.has(importStatement)) {
            fileContent = importStatement + '\n' + fileContent;
        }

        // Check if function already exists
        const functionRegex = new RegExp(`\\b${endpoint}\\s*=\\s*async`, 'g');

        if (!functionRegex.test(fileContent)) {
            const insertPosition = fileContent.lastIndexOf('}');
            const newFunction = `
    ${endpoint} = async (data: ${endpoint}Request): Promise<${endpoint}Response> => {
        try {
            // Add your business logic here
            
            return {} as ${endpoint}Response;
        } catch (error: any) {
            console.error(error);
            throw new Error(error.message);
        }
    }
            `;

            fileContent = fileContent.slice(0, insertPosition) + newFunction + '\n' + fileContent.slice(insertPosition);
        }
    });

    fs.writeFileSync(filePath, fileContent.trim());
    console.log(`Repository updated successfully!`);
};


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

const createUnitTests = (controller) => {
    const endpointsPath = `./src/controllers/${controller}/endpoints`;
    const endpoints = fs.readdirSync(endpointsPath)
        .filter(f => f !== '.DS_Store')
        .map(f => f.split('.')[0]);

    const testPath = `./src/tests/${controller}.ts`;

    // Ensure tests directory exists
    if (!fs.existsSync('./src/tests')) {
        fs.mkdirSync('./src/tests');
    }

    if (!fs.existsSync(testPath)) {
        // First run: Create a new test file
        console.log(`Creating new test file: ${testPath}`);

        const imports = `import { ${controller} } from '../lrpc/clientsFE/${service}';\nimport { Status } from 'node_lrpc';`;

        const testContent = `
${imports}

export const ${controller}Test = () => {
    ${endpoints.map(endpoint => createTestBlock(controller, endpoint)).join('')}
};
        `;

        fs.writeFileSync(testPath, testContent.trim());
        console.log(`Test file created successfully!`);
        return;
    }

    // If test file exists, update it
    console.log(`Updating existing test file: ${testPath}`);

    let fileContent = fs.readFileSync(testPath, 'utf8');

    let existingTests = new Set(fileContent.match(/describe\('Testing the endpoint \w+'/g) || []);

    endpoints.forEach(endpoint => {
        const testBlockIdentifier = `describe('Testing the endpoint ${endpoint}'`;

        if (!existingTests.has(testBlockIdentifier)) {
            const insertPosition = fileContent.lastIndexOf('};');
            fileContent = fileContent.slice(0, insertPosition) + createTestBlock(controller, endpoint) + fileContent.slice(insertPosition);
        }
    });

    fs.writeFileSync(testPath, fileContent.trim());
    console.log(`Test file updated successfully!`);
};

// Helper function to create a test block
const createTestBlock = (controller, endpoint) => `
    describe('Testing the endpoint ${endpoint}', () => {
        
        it("Validate ${endpoint}", async () => {
            const response = await ${controller}.${endpoint}({
                // Add your test data here
            } as any);
            expect(response.status).toBe<Status>('validationError');
        });

        it("Test ${endpoint}", async () => {
            const response = await ${controller}.${endpoint}({
                // Add your test data here
            } as any);
            expect(response.status).toBe<Status>('success');
        });
    });
`;



module.exports = {
    createController,
    createEndpoint,
    createRepository,
    generateRegistry,
    createUnitTests,
    resolveControllerIndex
}