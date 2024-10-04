#!/usr/bin/env node

const commander = require('commander');
const {createController, createEndpoint, generateRegistry, createUnitTests} = require('./bootstrapper');
const { fetchScript } = require('./scriptRepository');
const { exit } = require('process');
const fs = require('fs');

const program = new commander.Command();

program.version('1.0.4');

program.command('help')
    .description('Show help')
    .action(() => {
        program.help();
    });

program
    .command('create <controller>')
    .description('Create a controller')
    .action(() => {
        // push the latest microservice configuration to the server

        // console.log(process.argv[3])
        if(process.argv[3] === 'lrpc'){
            console.log('Cannot create controller with name lrpc');
            exit();
        }
        createController(process.argv[3]);
        console.log('Created Controller');
        exit();
    });

program
    .command('endpoint <controller> <endpoint>')
    .description('Create an endpoint')
    .action(() => {
        // push the latest microservice configuration to the server
        const controller = process.argv[3];
        const endpoint = process.argv[4];
    const controllerPath = `src/controllers/${controller}`;
    if(!fs.existsSync(controllerPath)){
        console.log('Controller does not exist');
    } else {
        if(!fs.existsSync(`${controllerPath}/endpoints`)){
            fs.mkdirSync(`${controllerPath}/endpoints`);
        }
        const endpointPath = `${controllerPath}/endpoints/${endpoint}.ts`;
        const endpointContent = createEndpoint(controller, endpoint);
        fs.writeFileSync(endpointPath, endpointContent);
        console.log('created endpoint');
        exit();
    }
    });

program.command('init')
    .description('Show help')
    .action(async () => {
        const config = `
module.exports = {
    application: default,
    service: 'my-service',
    appSecret: 'YOUR JWT',
    secret: 'mysecret',
    redisUrl: 'redis://localhost:6379',
}
`
        if(!fs.existsSync('./lrpc.config.js')){
            fs.writeFileSync('./lrpc.config.js', config);
            console.log('Created LRPC config file');
        } else {
            console.log('Config file already exists');
        }
        exit();
    });

program
    .command('pull')
    .description('Pull service clients')
    .action(async () => {
        // push the latest microservice configuration to the server
        const branch = process.env.NODE_ENV;
        await fetchScript(branch ?  branch : 'dev', resource);
        generateRegistry();
        console.log('Fetched Service Clients');
        exit();
    });

program
    .command('refresh')
    .description('Refresh Registery')
    .action(() => {
        generateRegistry();
        console.log('Refreshed registry');
        exit();
    });

program
    .command('unittest <controller>')
    .description('Refresh Registery')
    .action(() => {
        createUnitTests(process.argv[3]);
        console.log('Refreshed registry');
        exit();
    });
program.parse(process.argv);