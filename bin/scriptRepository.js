const fs = require('fs');
const { Redis } = require("ioredis");

const config = {
    host: 'localhost',
    port: 6379
}

const redis = new Redis(config);

export const fetchScript = async ()=>{
    const allServices = await redis.smembers('lrpc_services');
    allServices.forEach(async service =>{
        console.log(service);
        const script = await redis.get(`${service}_sc`);
        const folder = `./src/serviceClients`;
        if(!fs.existsSync(folder)){
            fs.mkdirSync(folder);
        }
        fs.writeFileSync(`./src/serviceClients/${service}.ts`, script);
});
}


fetchScript();