const fs = require('fs');
const { Redis } = require("ioredis");

const config = {
    host: 'localhost',
    port: 6379
}

const redis = new Redis(config);

const fetchScript = async (environment)=>{
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


const fetchScriptRemote = async (environment)=>{
    const allServices = await redis.smembers(`server-${environment}`);
    const scripts = await Promise.all(allServices.map(async service =>{
        const script = await redis.get(`${service}-${environment}-s`);
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