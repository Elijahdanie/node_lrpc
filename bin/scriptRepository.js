const fs = require('fs');
const { Redis } = require("ioredis");
const { redisUrl, application } = require('../../../../lrpc.config');


const fetchScript = async (environment) => {

    const redis = new Redis(redisUrl);

    const allServices = await redis.smembers(`${application}-server-${environment}`);

    if (!fs.existsSync(`./src/lrpc`)) {
        fs.mkdirSync(`./src/lrpc`);
    }

    const folder = `./src/lrpc/serviceClients`;


    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder);
    }

    await Promise.all(allServices.map(async service => {
        const script = await redis.get(`${application}-${service}-${environment}-s`);

        fs.writeFileSync(`./src/lrpc/serviceClients/${service}.ts`, script);
    }));
    const indexFile = './src/lrpc/serviceClients/index.ts';
    const utilsFile = './src/lrpc/serviceClients/utils.ts'
    const content = await resolveServiceIndexFile(indexFile, allServices);

    const utils = `
import axios from 'axios';
import { LRPCEngine } from '@elijahdanie/lrpc';

let urlCache:{
    [key: string]: string
} = {};

export const fetchHost = async (serviceName: string) => {
    const LRPC = LRPCEngine.instance as any;
    const result = await LRPC.redis.get(\`\${LRPC.application}-\${process.env.NODE_ENV}:\${serviceName}-host\`);
    return result;
}

export type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';

export const request = async (procedure: string, data: any, service: string, headers?: any) => {

    let url = urlCache[service];
    if (!url) {
        url = await fetchHost(service);
        urlCache[service] = url;
    }

    const response = await axios.post(url, {
            path: procedure,
            data
        },
        {
            headers: {
                ...headers
            }
        });
    return response;
}

export const queue = async (service: string, procedure: string, data: any, token?: string): Promise<any> => {
    const response = await LRPCEngine.instance.Queue.sendToQueue(service, data, procedure);
    return response;
}


export const formUpload = async (procedure: string, data: any, files: any[], headers: any, onUploadProgress: (progress: any) => void) => {
            
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
                        ...headers
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
`

    fs.writeFileSync(indexFile, content);
    fs.writeFileSync(utilsFile, utils);
    redis.disconnect();
}

const resolveServiceIndexFile = async (indexFile, allServices) => {

    const exists = fs.existsSync(indexFile);
    let fileContent = null;
    if(!exists){
        fileContent = `
const serviceClients = {
    
}

export default serviceClients;
`
    } else {
        fileContent = fs.readFileSync(indexFile, 'utf-8');
    }


    await Promise.all(allServices.map(service => {
        fileContent = updateServiceClients(fileContent, service);
    }));

return fileContent;
}

const updateServiceClients = (data, newImportName) => {

    // check if it exist in the data then append, else leave it alone
    const importStatement = `import ${newImportName} from "./${newImportName}";`;

    const checkContains = data.includes(importStatement);
    if(checkContains){
        return data;
    }
        const importRegex = new RegExp(`import\s+${newImportName}\s+from\s+"\.\/${newImportName}";`);
        
        // Add import statement if not already present
        let updatedData = importRegex.test(data) ? data : `${importStatement}\n${data}`;
        
        // Update serviceClients object
        const serviceClientsRegex = /const serviceClients\s*=\s*{([^}]*)}/;
        updatedData = updatedData.replace(serviceClientsRegex, (match, content) => {
            if (!content.includes(newImportName)) {
                let trimeC = content.trim();
                return `const serviceClients = {${trimeC ? trimeC + ',' : ''} ${newImportName}}`;
            }
            return match;
        });

        return updatedData;
}

const fetchScriptRemote = async (environment, LRPC, resource) => {
    const allServices = await LRPC.redis.smembers(`${application}-client-${environment}`);

    const scripts = await Promise.all(allServices.map(async service => {
        const script = await LRPC.redis.get(`${application}-${service}-${environment}-c`);
        return script;
    }));

    const scriptDictionary = {};

    scripts.forEach((script, index) => {
        scriptDictionary[allServices[index]] = script;
    });

    let footer =
        `import io from 'socket.io-client';\nimport FormData from 'form-data';\nimport axios from 'axios';\n\texport type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';`

    footer += `
        var socket: any;
        var token = '';
        export const setToken = (Token: string) => {
            token = Token;
        }
        export const request = async (procedure: string, data: any) => {
    
            const url = import.meta.env.VITE_GATEWAY_URL;
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

                const result = await request(procedure, data);

                if(result.data.status !== 'success'){
                    return result;
                }

                const socket = io(url, {
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
            
            const url = import.meta.env.VITE_MEDIA_URL;
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
    `
    scriptDictionary['index'] = footer;

    // console.log(scriptDictionary, 'scripts');

    // return scriptDictionary;
    if (scriptDictionary[resource]) {
        const selectedScripts = {
            index: scriptDictionary['index'],
            [resource]: scriptDictionary[resource]
        }
        return selectedScripts;
    } else {
        console.log(scriptDictionary[resource], resource, 'scripts');
        throw new Error('Resource not found');
    }
}

// fetchScriptRemote('dev');

module.exports = {
    fetchScript,
    fetchScriptRemote
}