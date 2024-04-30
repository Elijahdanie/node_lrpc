

const LRPCRedirect = ( url ) => (target, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args) {
        try {
            const data = args[0];

            const result = await originalMethod.apply(this, args);

            data.redirect = url;

            return data.response.redirect(url);
        } catch (error) {
            console.log(error);
            return {
                status: 'error',
                message: error.message
            };
        }
    };

    return descriptor;
}

const LRPCCallback = (target, propertyKey, descriptor) => {
    Reflect.defineMetadata("callback", true, target, propertyKey);
}

module.exports = {
    LRPCRedirect,
    LRPCCallback
}