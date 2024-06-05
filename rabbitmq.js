const amqp = require('amqplib/callback_api');


// docker RUN
// docker run -d -hostname rmq --name rabbitserver -p8080:15672 -p5672:5672 rabbitmq:3.12-managaement

class RabbitMq {

    constructor(queue, queueOptions) {
        this.queue = queue;
        this.options = queueOptions;
        this.channel = null;
        // console.log(queueOptions)
        this.connect()
            .then((channel) => {
                this.channel = channel;
            })
            .catch((error) => {
                console.error('Error connecting to RabbitMQ:', error);
            });
    }

    consumeCallback;
    connection;

    connect = () => {
        return new Promise((resolve, reject) => {
            amqp.connect(`${this.options.server}`, (error0, connection) => {
                if (error0) {
                    return reject(error0);
                }

                this.connection = connection;

                this.connection.createChannel((error1, channel) => {
                    if (error1) {
                        return reject(error1);
                    }
                    channel.assertQueue(this.queue, {
                        durable: false,
                    });

                    // Set the prefetch value to 1 to process messages one at a time
                    channel.prefetch(1);

                    this.channel = channel;

                    if (this.consumeCallback) {
                        this.channel.consume(this.queue, async (msg) => {
                            let data = JSON.parse(msg.content.toString());
                            await this.consumeCallback(data, this.done);

                            // Send acknowledgment (ack) after processing
                            this.channel.ack(msg);

                        });
                    }
                    resolve(channel);
                });
            });
        });
    };

    process = async (callback) => {
        this.consumeCallback = callback;
    };

    done() {
        // console.log('done with a queue item');
    }

    sendToQueue = (queue, message, procedure) => {
        const finalMessage = {
            data: message,
            srcPath: this.queue,
            path: procedure,
        }
        this.channel.sendToQueue(queue, Buffer.from(JSON.stringify(finalMessage)));
        console.log('Message sent to queue:', message, 'queue:', queue);
    }

    add = (data) => {
        if (!this.channel) {
            throw new Error('Channel is not initialized. Call connect first.');
        }
        this.channel.sendToQueue(this.queue, Buffer.from(JSON.stringify(data)));
    };
}

module.exports = {
    RabbitMq
};