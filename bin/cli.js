#!/usr/bin/env node

const commander = require('commander');
import {createController} from './bootstrapper';

const program = new commander.Command();

program.version('1.0.4');


program
    .command('create <controller>')
    .description('Create a controller')
    .action(() => {
        // push the latest microservice configuration to the server
        console.log('Pushing configuration to the server...');

        createController(process.argv[3]);
    });

// program
//     .command('endpoint <controller> <endpoint>')
//     .description('Create an endpoint')
//     .action(() => {
//         // push the latest microservice configuration to the server
//         console.log('Pushing configuration to the server...');

//         CodeGenerator.createEndpoint(process.argv[3]);
//     });

program.parse(process.argv);