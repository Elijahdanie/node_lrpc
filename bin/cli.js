#!/usr/bin/env node

const commander = require('commander');
const {createController, createEndpoint, generateRegistry, createUnitTests, createRepository, resolveControllerIndex} = require('./bootstrapper');
const { fetchScript } = require('./scriptRepository');
const { exit } = require('process');
const fs = require('fs');
const path = require('path');
const defaultInquirer = require('inquirer');
const inquirer = defaultInquirer.default;

const program = new commander.Command();

program.version('1.0.4');

program.command('help')
    .description('Show help')
    .action(() => {
        program.help();
    });

program
    .command('create')
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

        // createController(process.argv[3]);
        console.log('Created Controller');
        exit();
    });

program
    .command('endpoint')
    .description('Create an endpoint')
    .action(async () => {

        const controllersPath = './src/controllers';

        // Check if controllers directory exists
        if (!fs.existsSync(controllersPath)) {
            console.log('⚠️ No controllers found. Please create a controller first.');
            return;
        }

        // Get a list of all controllers
        const controllers = fs.readdirSync(controllersPath).filter((dir) => 
            fs.statSync(path.join(controllersPath, dir)).isDirectory()
        );

        if (controllers.length === 0) {
            console.log('⚠️ No controllers available. Please create a controller first.');
            return;
        }

        // Step 1: Let the user choose a controller
        const { controller } = await inquirer.prompt([
            {
                type: 'list',
                name: 'controller',
                message: 'Select a controller:',
                choices: controllers,
            },
        ]);

        // Step 2: Prompt for endpoint name
        const { endpoint } = await inquirer.prompt([
            {
                type: 'input',
                name: 'endpoint',
                message: 'Enter endpoint name:',
                validate: (input) => (input.trim() ? true : 'Endpoint name cannot be empty!'),
            },
        ]);

        // Step 3: Create endpoint directory if it doesn't exist
        const controllerPath = path.join(controllersPath, controller);
        const endpointsDir = path.join(controllerPath, 'endpoints');
        const repositoryPath = `${controllerPath}/${controller}Repository.ts`;

        if (!fs.existsSync(endpointsDir)) {
            fs.mkdirSync(endpointsDir);
        }

        // Step 4: Create the endpoint file
        const endpointPath = path.join(endpointsDir, `${endpoint}.ts`);
        if (fs.existsSync(endpointPath)) {
            console.log('⚠️ Endpoint already exists!');
            return;
        }

        const endpointContent = createEndpoint(controller, endpoint);
        fs.writeFileSync(endpointPath, endpointContent);
        // we need to input the implementation here
        createRepository(controller, repositoryPath, [
            endpoint
        ]);

        resolveControllerIndex(controller, [endpoint], controllerPath);
        createUnitTests(controller);

        console.log(`✅ Created endpoint: ${controller}/endpoints/${endpoint}.ts`);
    });

program.command('init')
    .description('Initialize LRPC configuration')
    .action(async () => {
        const configPath = './lrpc.config.js';

        // Check if config file exists
        if (fs.existsSync(configPath)) {
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: '⚠️ Config file already exists. Do you want to overwrite it?',
                    default: false,
                }
            ]);

            if (!overwrite) {
                console.log('🚫 Configuration unchanged. Exiting.');
                return;
            }
        }

        console.log('\n👉 Setting up LRPC configuration...\n');

        // Step 1: Collect configuration details
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'application',
                message: 'Enter the microservice application name:',
                default: 'default',
            },
            {
                type: 'input',
                name: 'service',
                message: 'Enter this service name:',
                default: 'my-service',
            },
            {
                type: 'input',
                name: 'secret',
                message: 'Enter client encryption secret:',
                default: 'mysecret',
            },
        ]);

        // Step 2: Generate config file content
        const configContent = `
// Do not edit directly, Run "npx lrpc init" instead
const { config } = require('dotenv');

config();
module.exports = {
    application: '${answers.application}',
    service: '${answers.service}',
    appSecret: 'process.env.JWT_SECRET',
    secret: '${answers.secret}',
    redisUrl: 'process.env.REDIS_URL',
};
        `.trim();

        // Step 3: Write the config file
        fs.writeFileSync(configPath, configContent);
        console.log('✅ Created LRPC config file: lrpc.config.js');
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