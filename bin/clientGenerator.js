const fs = require('fs');


const serviceHandlerPromises = [];
const typeLibrary = {};
const propAccumulator = {};
var clientScript = ``;
var serviceClient = ``;


const getTypeDefinitions = (type, isMedia) => {
    const data = propAccumulator[type];

    if (!data) {
        if (isMedia) {
            return `{\n\t\t\tfiles: any[];\n\t\t}`
        }
        return 'any'
    } else {
        let typeDef = '{\n';
        for (const key in data) {
            typeDef += `\t\t\t${key}${data[key].isoptional ? '?' : ''}: ${data[key].type};\n`
        }
        if (isMedia) {
            typeDef += `\t\t\tfiles: any[];\n`
        }
        typeDef += '\t\t}';
        return typeDef;
    }
}

const generateClientCode = (controllerName, className, methodName, request, response, LRPC, isSocket) => {

    return `
        static async ${className}(data: ${getTypeDefinitions(request.name)} | ${request.name}${isSocket ? ", onMessage: (message) => void":""}):Promise<${response.name}> {

            try {

                const dataKey = '${LRPC.service}.${controllerName}.${className}';

                const response = ${!isSocket ? "await request(dataKey, data);":`await requestSocket("${process.env.SERVICEHOST.replace('/lrpc', '')}", dataKey, data, onMessage);`}

                return response.data;
            } catch (error) {
                return {
                    message: (error as any).message,
                    status: 'error',
                    data: {} as any
                }
            }
        }`
}

const generateFormServiceCode = (controllerName, className, methodName, request, response, LRPC, isAuth) => {
    return `
        ${className}: {
            ${isAuth ? `auth: '${isAuth}',` : ''}
            request: async (data:  ${getTypeDefinitions(request.name, true)}, onUploadProgress: (progress: any) => void, headers?: any): Promise<${response.name}> => {

                try {
    
                    const procedure = '${LRPC.service}.${controllerName}.${className}';

                    const { files, ...payload } = data as ${request.name} & { files: any[] };

                    const response = await formUpload(procedure, data, files, headers, onUploadProgress);
    
                    return response.data;
                } catch (error) {
                    return {
                        message: (error as any).message,
                        status: 'error',
                        data: {} as any
                    }
                }
            }
        },
    `
}

const generateFormDataUpload = (controllerName, className, methodName, request, response, LRPC) => {
    return `
        static async ${className}(data: ${getTypeDefinitions(request.name, true)} | ${request.name}, onUploadProgress: (progress: any) => void):Promise<${response.name}> {

            try {

                const dataKey = '${LRPC.service}.${controllerName}.${className}';

                const { files, ...payload } = data as ${request.name} & { files: any[] };

                const response = await formUpload(dataKey, payload, files, onUploadProgress);

                return response.data;
            } catch (error) {
                return {
                    message: (error as any).message,
                    status: 'error',
                    data: {} as any
                }
            }
        }`

}

const generateServiceCode = (controllerName, className, methodName, request, response, LRPC, isAuth) => {
    return `
        ${className}: {
            ${isAuth ? `auth: '${isAuth}',` : ''}
            request: async (data: ${request.name}, headers?: any): Promise<${response.name}> => {

                try {
    
                    const procedure = '${LRPC.service}.${controllerName}.${className}';
    
                    const response = await request(procedure, data, '${LRPC.service}', headers);
    
                    return response.data;
                } catch (error) {
                    return {
                        message: (error as any).message,
                        status: 'error',
                        data: {} as any
                    }
                }
            },
            queue: async (data: ${request.name}, token?: string): Promise<${response.name}> => {
                return new Promise((resolve, reject)=>{
                    try {
        
                        const procedure = '${LRPC.service}.${controllerName}.${className}';
                        const service = '${LRPC.service}-${LRPC.environment}';
        
                        const response = queue(service, procedure, data, token);
        
                        resolve(response);
                    } catch (error) {
                        reject({
                            message: (error as any).message,
                            status: 'error',
                            data: {}
                        });
                    }
                });
            
            }
        },
    `
}


const createServiceClient = (LRPC) => {
    const controllerMaps = {};

    // set the hostname quickly
    LRPC.redis.set(`${LRPC.application}-lrpcHost:${LRPC.service}-host`, process.env.SERVICEHOST);
    setTimeout(async () => {
        const header = `//Automatically generated by LRPC do not edit\nimport {Status, request, queue, formUpload} from './utils'`;

        const controllers = [];
        const permissions = {};
        await Promise.all(serviceHandlerPromises.map(async p => {
            const result = await p();
            const { controller, methodName, name, request, response, isAuth } = result;
            const script = !result.isMedia ? generateServiceCode(controller, methodName, name, request, response, LRPC, isAuth)
                : generateFormServiceCode(controller, methodName, name, request, response, LRPC, isAuth);
            result.script = script;


            // const permissionKey =`${LRPC.service}.${controller}`;
            const permissionKey = `${controller}`;
            let permission = permissions[permissionKey];

            if (!permission) {
                permissions[permissionKey] = {
                    endpoints: {
                        [methodName]: true
                    },
                    limit: 0,
                    resources: []
                }
            } else {
                permission.endpoints[methodName] = true;
            }
            // console.log(result.controller, 'done');
            if (!controllerMaps[result.controller]) {
                controllerMaps[result.controller] = `
    export const ${result.controller} = {\n${result.script}`;
            } else {
                controllerMaps[result.controller] += `\t${result.script}\n`
            }

            if (!controllers.includes(result.controller)) {
                controllers.push(result.controller);
            }

        }));
        // console.log(controllers, 'done');

        const allScripts = await Promise.all(Object.keys(controllerMaps).map(async controller => {
            let script = controllerMaps[controller];
            script += `\n}`;

            let types = '';
            for (const key in typeLibrary[controller]) {
                types += `\n${typeLibrary[controller][key]}`;
            }

            script += `\n ${types}`;

            return script;
        }));
        let footer = `\nexport default {${controllers.join(',')}}`
        serviceClient = header + allScripts.join('\n\n') + footer;
        // const folder = `./src/lrpc/serviceClients`;
        //     if(!fs.existsSync(folder)){
        //         fs.mkdirSync(folder);
        //     }
        //     fs.writeFileSync(`./src/lrpc/serviceClients/${LRPC.service}.ts`, serviceClient);
        fs.writeFileSync(`./src/lrpc/serviceClients/${LRPC.service}.access.json`, JSON.stringify({ [LRPC.service]: permissions }, null, 2));
        // LRPC.redis.set(`${LRPC.service}-${LRPC.environment}-p`)
        LRPC.redis.set(`${LRPC.application}-${LRPC.service}-${LRPC.environment}-s`, serviceClient);
        LRPC.redis.sadd(`${LRPC.application}-server-${LRPC.environment}`, LRPC.service);
    }, 1000);
}

const createFEClient = (LRPC) => {
    const controllerMaps = {};

    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            const header = `//Automatically generated by LRPC do not edit\n//@ts-ignore\nimport { Status, formUpload, request, requestSocket } from '.';\n\n`;

            const controllers = [];
            await Promise.all(serviceHandlerPromises.map(async p => {
                const result = await p();
                if(!result.service){
                const { controller, methodName, name, request, response } = result;
                const script = !result.isMedia ? generateClientCode(controller, methodName, name, request, response, LRPC, result.isSocket)
                    : generateFormDataUpload(controller, methodName, name, request, response, LRPC);
                result.script = script;
                // console.log(result.controller, 'done');
                if (!controllerMaps[result.controller]) {
                    controllerMaps[result.controller] = `
    
    export class ${result.controller} {\n${result.script}`;
                } else {
                    controllerMaps[result.controller] += `\t${result.script}\n`
                }

                if (!controllers.includes(result.controller)) {
                    controllers.push(result.controller);
                }
                }

            }));
            // console.log(controllers, 'done');

            const allScripts = await Promise.all(Object.keys(controllerMaps).map(async controller => {
                let script = controllerMaps[controller];
                script += `\n}`;

                let types = '';
                for (const key in typeLibrary[controller]) {
                    types += `\n${typeLibrary[controller][key]}`;
                }

                script += `\n ${types}`;

                return script;
            }));

            let footer =
                `import io from 'socket.io-client';\nimport FormData from 'form-data';\nimport axios from 'axios';\n\texport type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';`

            footer += `
    var socket: any;
    export const request = async (procedure: string, data: any) => {

        const token = process.env.TOKEN;
        const url = process.env.GATEWAYURL;
        if(url){
            const response = await axios.post(url, {
                    path: procedure,
                    data
                },
                {
                    headers: {
                        Authorization: token
                    }
                });
            return response;
        } else {
            return {
                data: {
                    message: 'Gateway URL not set',
                    status: 'error'
                }
            }
        }
    }

    export const disconnectSocket = () => {
        if(socket){
            socket.disconnect();
        }
    }

    export const requestSocket = async (url: string, procedure: string, data: any, onMessage: (message: any) => void) => {
        try {
            const token = process.env.TOKEN;

            const result = await request(procedure, data);

            if(result.data.status !== 'success'){
                return result;
            }

            socket = io(url, {
                query: {
                    token,
                    path: procedure
                }
            });
            socket.on('message', (message: any) => {
                onMessage(message);
            });
            socket.connect();

                return result;
            }  catch(error) {
            return {
                data: {
                    message: 'Failed to set up socket connection',
                    status: 'error'
                }
            }
        }
    }

    export const formUpload = async (procedure: string, data: any, files: any[], onUploadProgress: (progress: any) => void) => {
            
            const token = process.env.TOKEN;
            const url = process.env.MEDIAURL;
            if(url){
                const formData = new FormData();
                for(const key in data){
                    // console.log(key, data[key])
                    formData.append(key, data[key]); 
                }
                for(const file of files){
                    formData.append('files', file);
                }
                formData.append('path', procedure);
                const response = await axios.post(url, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: token
                    },
                    onUploadProgress
                });
                return response;
            } else {
                return {
                    data: {
                        message: 'Gateway URL not set',
                        status: 'error'
                    }
                }
            }
        }

    // export const controllers = [${controllers.join(',')}]

`
            clientScript = header + allScripts.join('\n\n');
            const folder = `./src/lrpc/clientsFE`;
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
            fs.writeFileSync(`./src/lrpc/clientsFE/${LRPC.service}.ts`, clientScript);
            fs.writeFileSync(`./src/lrpc/clientsFE/index.ts`, footer);
            LRPC.redis.set(`${LRPC.application}-${LRPC.service}-${LRPC.environment}-c`, clientScript);
            LRPC.redis.sadd(`${LRPC.application}-client-${LRPC.environment}`, LRPC.service);
            resolve("done");
        }, 1000);
    });
}

const fetchClientScript = () => {
    return clientScript;
}

const fetchServiceClient = () => {
    return serviceClient;
}

module.exports = {
    serviceHandlerPromises,
    typeLibrary,
    propAccumulator,
    generateClientCode,
    generateServiceCode,
    createServiceClient,
    createFEClient,
    fetchClientScript,
    fetchServiceClient
}
