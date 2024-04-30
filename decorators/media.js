require("reflect-metadata");

const LRPCMedia = ( fieldName ) => (target, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;

    Reflect.defineMetadata("media", true, target, propertyKey);
    descriptor.value = function (...args) {

        try {
            const data = args[0];

            const request = data.request;

            const files = request[fieldName];

            if (!files) {
                return {
                    status: 'validationError',
                    message: 'No files uploaded, make sure the field name specified in decorator matches the files field names in the request.'
                }
            }
            data.files = files;


        } catch (error) {
            console.log(error);
            return {
                status: 'error',
                message: error.message
            }
        }

        return originalMethod.apply(this, args);
    };
    return descriptor;
};

module.exports = {
    LRPCMedia
}