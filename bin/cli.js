#!/usr/bin/env node

const commander = require('commander');
const {createController, createEndpoint, generateRegistry, createUnitTests} = require('./bootstrapper');
const { fetchScript } = require('./scriptRepository');
const { exit } = require('process');
const fs = require('fs');

const program = new commander.Command();

program.version('1.0.4');


program
    .command('create <controller>')
    .description('Create a controller')
    .action(() => {
        // push the latest microservice configuration to the server

        // console.log(process.argv[3])
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

program
    .command('pull')
    .description('Pull service clients')
    .action(async () => {
        // push the latest microservice configuration to the server

        await fetchScript();
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