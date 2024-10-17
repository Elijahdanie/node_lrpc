
// const { LRPCEngine } = require('..');
const fs = require('fs');


// save registration to events to redis
// fetch the subscribers and then invoke the subscribers
// using the end to end encryption that can bypass the token
// 

const { default: Container } = require("typedi");
const { application, service } = require('../../../../lrpc.config');

const Subscribers = [];

const Events = [];

const classInstanceDict = {};

class EventManager {

    eventHandlers = {}

    static instance = null
    redis = null;
    LRPC
    constructor(LRPC){
        this.instance = this;
        this.LRPC = LRPC;
    }

    generateEvents = async (redis) => {
        const redisEventKey = `${application}-events`;
        const events = await this.LRPC.redis.smembers(redisEventKey);
    
    
        // create a type for the event
        const eventType = events.length > 0 ? `export type LRPCEventType = ${events.join(' | ')};`
                                            : `export type LRPCEventType = '';`;
    
        const path = `${__dirname}/event.d.ts`;
        fs.writeFileSync(path, eventType);
    }

    registerEvent = async (subscriber) => {

        const [event, className, methodName] = subscriber.split('-');

        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = {};
        }

        if (!this.eventHandlers[event][className]) {
            this.eventHandlers[event][className] = [];
        }

        this.eventHandlers[event][className].push(methodName);

        // console.log(this.eventHandlers);

        const subscriberRedis = `${this.LRPC.service}-${subscriber}`;
        const eventKey = `${this.LRPC.application}-event-${event}`;
        const record = await this.LRPC.redis.sadd(eventKey, subscriberRedis);

        // console.log(record);

        // const allServices = await LRPC.redis.smembers(`${application}-client-${environment}`);

        // register on redis,
        // how ?
        // service that the method exist on would register to redis
        // we have eventName-key: service-eventName-className
    }


    isSubscribed = async (event) => {
        if(this.eventHandlers[event]){
            return true;
        }

        return false;
    }

    invokeEvent = async (event, payload, isChild) => {

        if(!isChild){
            const eventKey = `${this.LRPC.application}-event-${event}`;
            const subscribers = await this.LRPC.redis.smembers(eventKey);

            console.log('SUBSCRIBERS', subscribers);
            // for every subscribers we would push the event to their queue
            for (const subscriber of subscribers) {
                const [service, event, className, methodName] = subscriber.split('-');

                if(service === this.LRPC.service) {
                    continue;
                }
                
                const procedure = `${event}`;
                const serviceKey = `${service}-${this.LRPC.environment}`;
                const response = await this.LRPC.Queue.sendToQueue(serviceKey, payload, procedure, true);

            }
        }


        // local implementation
        if (!this.eventHandlers[event]) {
            return;
        }

        const LClass = this.eventHandlers[event];
        // console.log(LClass);

        for (const aClass in LClass) {
            
            const methods = LClass[aClass];

            methods.forEach(async (method) => {
                const instance = Container.get(classInstanceDict[aClass]);
                await instance[method](payload);
            });
        }
    }
}

const subScribeEvent = (eventType) => (target, propertyKey, descriptor) => {

    if(!eventType){
        throw new Error('Event type is required');
    }
 
    const event = eventType;
    const className = target.constructor.name;
    const methodName = propertyKey;

    const eid = `${event}-${className}-${methodName}`;
    if (!classInstanceDict[className]) {
        classInstanceDict[className] = target.constructor;
        // console.log('CLASS INSTANCE DICT', classInstanceDict);
    }
    
    Subscribers.push(eid);
}

const LRPCEvent = (controller) => (target, propertyKey, descriptor) => {
    const event = `'${service}.${controller}.${target.constructor.name}'`;

    Events.push(event);
}

module.exports = {
    LRPCEvent,
    subScribeEvent,
    EventManager,
    Subscribers,
    Events
}