require("reflect-metadata");

const LRPCMedia = () => (target, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;

    Reflect.defineMetadata("media", true, target, propertyKey);
    descriptor.value = function (...args) {

        try {
            const data = args[0];

            if (!data){
                return {
                    status: 'error',
                    message: `No data provided in method ${propertyKey} in class ${target.constructor.name}`
                }
            }

            const request = data.request;

            if (!request) {
                return {
                    status: 'error',
                    message: 'No request object found in data'
                }
            }

            const files = request.files;

            if (!files) {
                return {
                    status: 'validationError',
                    message: 'No ${fieldName} uploaded, make sure the field name specified in decorator matches the files field names in the request.'
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