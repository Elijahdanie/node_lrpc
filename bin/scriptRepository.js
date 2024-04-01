const fs = require('fs');
const { Redis } = require("ioredis");

const config = {
    host: 'localhost',
    port: 6379
}

const redis = new Redis(config);

const fetchScript = async ()=>{
    const allServices = await redis.smembers('lrpc_services');
    await Promise.all(allServices.map(async service =>{
        const script = await redis.get(`${service}_sc`);
        const folder = `./src/serviceClients`;
        if(!fs.existsSync(folder)){
            fs.mkdirSync(folder);
        }
        fs.writeFileSync(`./src/serviceClients/${service}.ts`, script);
    }));
    const indexFile = './src/serviceClients/index.ts';
    const content = `
    ${allServices.map(service => `
import ${service} from "./${service}";`).join('\n')}

const serviceClients = {
    ${allServices.map(service => `...${service}`).join(',\n')}
}
    
 export default serviceClients;
`;

fs.writeFileSync(indexFile, content);
    redis.disconnect();
}

module.exports = {
    fetchScript
}