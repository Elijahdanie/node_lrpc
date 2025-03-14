# LRPC Framework

## Overview
LRPC (Lightweight Remote Procedure Call) is a high-performance framework for handling inter-service communication efficiently. It provides an easy-to-use API for defining RPC endpoints, managing authentication, and handling real-time events.

## Features
- **High-performance request handling**
- **Built-in authentication and authorization**
- **Supports WebSockets for real-time communication**
- **Queue-based request processing with RabbitMQ**
- **Redis caching support**
- **Flexible validation and permission system**
- **Extensible with decorators for easy API development**

## Installation
```sh
npx create-node-lrpc create <application> <service>
```

## Folder Structure
```

/
│── lrpc.config.js
│── src
│   ├── controllers
│   │   ├── sampleController
│   │   │   ├── endpoints
│   │   │   │   ├── endpointCreate.ts
│   │   │   │   ├── endpointUpdate.ts
│   │   │   │   ├── endpointDelete.ts
│   │   │   ├── repository.ts
│   ├── lrpc
│   │   ├── clientFE
│   │   │   ├── api.ts
│   │   │   ├── index.ts
│   │   ├── serviceClient
│   │   │   ├── api.ts
│   │   │   ├── index.ts
│   │   │   ├── utils.ts
│   │   ├── registery.ts
│   ├── index.ts
│   ├── tests
│   │   ├── index.test.ts
│   │   ├── sampleController.ts
│   ├── utils
│   │   ├── index.ts
│   ├── .dockerignore
│   ├── .env
│   ├── Dockerfile
│   ├── jest.config.js
│   ├── lrpc.config.js
│   ├── package.json
│   └── tsconfig.json
```


## Quick Start
```sh
npx lrpc init
```

```typescript
import express from 'express';
import { initLRPC, initWorkers } from 'node_lrpc';
import bodyParser from 'body-parser';
import { PrismaClient } from '@prisma/client';
import { controllers, serviceClients } from './lrpc/registery';
import Container from 'typedi';

// console.log('Starting server');

export const prisma = new PrismaClient();
const app = express();
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

app.get('/', (req, res) => {
  res.send(`Hello World from ${process.env.REPLICAS}`);
});


export const LRPC = initLRPC({
  application: 'smartbloks',
  service: 'ai',
  app
},
controllers,
serviceClients,
Container, {} as any);
// initWorkers(3, __filename);

```

## Configuration
LRPC can be configured via the `lrpc.config.js` file:
```javascript
const { config } = require('dotenv');
config();

module.exports = {
    application: 'applicationName',
    service: 'api',
    secret: 'mysecret',
    appSecret: process.env.JWT_SECRET,
    redisUrl: process.env.REDIS_URL
}
```

## Defining Endpoints
Endpoints in LRPC are defined using decorators and typed request-response models.

### Example Endpoint Definition
```typescript
import { LRPCAuth, LRPCFunction, LRPCPayload, LRPCProp, LRPCPropArray } from "node_lrpc";
import { BaseResponse, HandlerConfig, LRPCRequest, Status, IEndpoint } from "node_lrpc";
import engineRepository from "../engineRepository";
import Container, { Service } from "typedi";

const controller = "engine";

@LRPCPayload(controller)
export class ImageChoices {
  @LRPCProp
  rprompt: string;

  @LRPCProp
  url: string;
}

@LRPCPayload(controller)
export class createImageRequest {
  @LRPCProp
  prompt: string;
}

@LRPCPayload(controller, true)
export class createImageResponse {
  @LRPCPropArray(ImageChoices)
  imageChoices: ImageChoices[];
}

@Service()
export class createImage implements HandlerConfig<createImageRequest, createImageResponse> {
  _engineRepository: engineRepository;
  
  constructor() {
    this._engineRepository = Container.get(engineRepository);
  }

  async validator(input: createImageRequest): Promise<{ message: string; status: Status }> {
    if (!input.prompt) {
      return { message: "prompt is required", status: "validationError" };
    }
    return { message: "Validated successfully", status: "success" };
  }

  @LRPCAuth()
  @LRPCFunction(controller, createImageRequest, createImageResponse)
  async handler(data: LRPCRequest<createImageRequest>): Promise<BaseResponse<createImageResponse>> {
    try {
      const response = await this._engineRepository.createImage(data.payload);
      return { message: "Created successfully.", status: "success", data: response };
    } catch (error) {
      console.log(error);
      return { message: (error as any).message, status: "error" };
    }
  }
}
```

## CLI Commands
LRPC provides a CLI tool for managing controllers and endpoints.

### Initialize LRPC
```sh
npx lrpc init
```
This command initializes the LRPC configuration file (`lrpc.config.js`) if it does not already exist.

### Create a Controller
```sh
npx lrpc create <controller-name>
```
Creates a new controller with the specified name. It bootstraps the controller and its associated endpoints by creating a folder with the controller's name and generating four CRUD endpoint `.ts` files inside an `endpoints` subfolder.

### Create an Endpoint
```sh
npx lrpc endpoint <controller-name> <endpoint-name>
```
Creates a new endpoint inside the specified controller's folder. The command generates a `.ts` file with the endpoint name inside the controller's `endpoints` folder.

### Pull Service Clients
```sh
npx lrpc pull
```
Fetches scripts from other services and places them inside `./src/lrpc/serviceClient`.

### Refresh Registry
```sh
npx lrpc refresh
```
Updates the `./src/lrpc/registry` file, which contains all the registered controllers.

### Booststrap Unit Tests
```sh
npx lrpc unittest <controller-name>
```
Booststraps unit tests for the specified controller.

## Authentication
LRPC provides built-in authentication via `AuthService`:
```typescript
const token = AuthService.sign({ userId: 123 });
const decoded = AuthService.verify(token, "/secure-endpoint");
```

## Using Redis & RabbitMQ
```typescript
const lrpc = new LRPCEngine();
lrpc.redis.set("key", "value");
lrpc.Queue.sendToQueue("taskQueue", { task: "processData" }, "procedureName");
```

## Decorators

### `@LRPCAuth`
This decorator is used to add authorization to an endpoint by specifying the roles that are allowed to access it.

#### Usage:
```typescript
class ExampleService {
  @LRPCAuth(['admin'])
  @LRPCFunction(controller, sampleRequest, sampleResponse)
  async someProtectedMethod(data: any) {
    // Implementation
  }
}
```

#### Parameters:
- `roles?: string[]` - An optional array of roles that are authorized to access the method.

---

### `@LRPCPayload`
This decorator marks a class as part of the type definition in the request payload or response of an endpoint.

#### Usage:
```typescript
@LRPCPayload('<controller>', true)
class CreateUserResponse {
  id: string;
  name: string;
}
```

#### Parameters:
- `path: string` - The path of the endpoint.
- `isResponse?: boolean` - Whether the class represents a response payload.

---

### `@LRPCPropOp`
Marks a field in an `LRPCPayload` as optional.

#### Usage:
```typescript
class User {
  @LRPCPropOp
  middleName?: string;
}
```

#### Parameters:
- `target: any` - The class prototype.
- `key: string` - The field name.

---

### `@LRPCSocket`
Marks an endpoint as a socket-based endpoint.

#### Usage:
```typescript
@Service()
class ChatService {

  @LRPCSocket
  @LRPCFunction(controller, sampleRequest, sampleResponse)
  async handleMessage(data: any) {
    // Handle socket message
  }
}
```

#### Parameters:
- `target: any` - The class prototype.
- `key: string` - The method name.

---

### `@LRPCProp`
Marks a field in an `LRPCPayload` as required.

#### Usage:
```typescript
class User {
  @LRPCProp
  firstName: string;
}
```

#### Parameters:
- `target: any` - The class prototype.
- `key: string` - The field name.

---

### `@LRPCObjectProp`
Decorates a field with object-type definitions.

#### Usage:
```typescript
class User {
  @LRPCObjectProp({ name: 'string' }, false)
  metadata: { name: string };
}
```

#### Parameters:
- `value: any` - The object type definition.
- `optional: boolean` - Whether the property is optional.

---

### `@LRPCType`
Decorates a field with a custom type definition such as enums or union type.

#### Usage:
```typescript
class Task {
  @LRPCType(`'start' | 'stop' | 'pause' | 'resume'`, false)
  status: 'start' | 'stop' | 'pause' | 'resume';
}
```

#### Parameters:
- `value: any` - The custom type definition.
- `optional: boolean` - Whether the property is optional.




## Benchmarks
LRPC is optimized for low-latency communication. Benchmarks coming soon.

## Contributing
Feel free to contribute by submitting pull requests or opening issues.

## License
MIT License

## Contact
For questions, issues, or contributions, contact us at thachromatone@gmail.com

### For More Information on this visit [https://quadinet.github.io/lrpc](https://quadinet.github.io/lrpc)

