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

const serviceClients = {
    ${allServices.map(service => `${service}`).join(',\n')}
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

    // console.log(scriptDictionary, 'scripts');

    return scriptDictionary;
}

// fetchScriptRemote('dev');

module.exports = {
    fetchScript,
    fetchScriptRemote
}