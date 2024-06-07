
const client = require('prom-client');
const app = require('express')();


const processMetrics = async ()=> {
    const metricsInterval = client.collectDefaultMetrics();

    metricsInterval();
    await app.get('/metrics', (req, res) => {
        res.set('Content-Type', client.register.contentType);
        res.end(client.register.metrics());
    });

    app.listen(9100, () => {
        console.log(`metrics server running`)
    });
}

module.exports = processMetrics;
