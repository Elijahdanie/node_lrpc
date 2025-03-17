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
    .action(async () => {
        // if(process.argv[3] === 'lrpc'){
        //     console.log('Cannot create controller with name lrpc');
        //     exit();
        // }

        const { controllerName } = await inquirer.prompt([
            {
                type: 'input',
                name: 'controllerName',
                message: 'Enter controller name:',
                validate: (input) => {
                    if (!input.trim()) return 'Controller name cannot be empty!';
                    if (input.toLowerCase() === 'lrpc') return 'Cannot create controller with name "lrpc"!';
                    return true;
                },
            },
        ]);

        const { mode } = await inquirer.prompt([
            {
                type: 'list',
                name: 'mode',
                message: 'How do you want to create endpoints?',
                choices: ['Manually', 'Automatically (CRUD)'],
            },
        ]);

        let endpoints = [];

        if (mode === 'Automatically (CRUD)') {
            endpoints = [];
            console.log(`\n✅ Bootstrapped CRUD endpoints: ${endpoints.join(', ')}`);
        } else {
            console.log(`\n👉 Enter endpoint names one by one. Press ENTER on an empty input to finish.`);
            while (true) {
                const { endpoint } = await inquirer.prompt([
                    {
                        type: 'input',
                        name: 'endpoint',
                        message: 'Enter endpoint name:',
                    },
                ]);
                if (!endpoint.trim()) break;
                endpoints.push(endpoint.trim());
            }
        }

        createController(controllerName, endpoints);

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
        await fetchScript(branch ?  branch : 'dev');
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