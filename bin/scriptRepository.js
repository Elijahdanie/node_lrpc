const fs = require('fs');
const { Redis } = require("ioredis");
const { redisUrl } = require('../../../../lrpc.config');

const fetchScript = async (environment)=>{
    
    const redis = new Redis(redisUrl);
    
    const allServices = await redis.smembers(`server-${environment}`);
    console.log(allServices, 'service')
    await Promise.all(allServices.map(async service =>{
        const script = await redis.get(`${service}-${environment}-s`);
        const folder = `./src/lrpc/serviceClients`;

        if(!fs.existsSync(`./src/lrpc`)){
            fs.mkdirSync(`./src/lrpc`);
        }

        if(!fs.existsSync(folder)){
            fs.mkdirSync(folder);
        }
        fs.writeFileSync(`./src/lrpc/serviceClients/${service}.ts`, script);
    }));
    const indexFile = './src/lrpc/serviceClients/index.ts';
    const utilsFile = './src/lrpc/serviceClients/utils.ts'
    const content = `
    ${allServices.map(service => `
import ${service} from "./${service}";`).join('\n')}
const serviceClients = {
    ${allServices.map(service => `${service}`).join(',\n')}
}

 export default serviceClients;
`;

const utils = `
import axios from 'axios';
import { LRPCEngine } from '@elijahdanie/lrpc';

export type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';

export const request = async (procedure: string, data: any, url: string, token?: string) => {
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
}

export const queue = async (procedure: string, data: any, token?: string): Promise<any> => {
    const response = await LRPCEngine.instance.Queue.add({
        path: procedure,
        token,
        data
    });
    return response;
}
`

fs.writeFileSync(indexFile, content);
fs.writeFileSync(utilsFile, utils);
redis.disconnect();
}


const fetchScriptRemote = async (environment, LRPC)=>{
    const allServices = await LRPC.redis.smembers(`client-${environment}`);
    const scripts = await Promise.all(allServices.map(async service =>{
        const script = await LRPC.redis.get(`${service}-${environment}-c`);
        return script;
    }));

    const scriptDictionary = {};

    scripts.forEach((script, index)=>{
        scriptDictionary[allServices[index]] = script;
    });

    let footer =
    `import FormData from 'form-data';\nimport axios from 'axios';\n\texport type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';`

    footer +=  `
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
    `
        scriptDictionary['index'] = footer;

    // console.log(scriptDictionary, 'scripts');

    return scriptDictionary;
}

// fetchScriptRemote('dev');

module.exports = {
    fetchScript,
    fetchScriptRemote
}