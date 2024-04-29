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
    const content = `
    ${allServices.map(service => `
import ${service} from "./${service}";`).join('\n')}
import axios from 'axios';
import { LRPCEngine } from '@elijahdanie/lrpc';

export type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';

const serviceClients = {
    ${allServices.map(service => `${service}`).join(',\n')}
}

export const request = async (procedure: string, data: any, token?: string) => {
    const response = await axios.post('${process.env.HOSTNAME}', {
            path: procedure,
            data
        },
        {
            headers: {
                Authorization: 'Bearer ' + token
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

 export default serviceClients;
`;

fs.writeFileSync(indexFile, content);
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
    `import axios from 'axios';\n\texport type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';`
    
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