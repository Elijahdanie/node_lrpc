



const LRPCMedia = ( fieldName ) => (target, propertyKey, descriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = function (...args) {

        try {
            const data = args[0];

            const request = data.request;

            const files = request[fieldName];

            if (!files) {
                return {
                    status: 'validationError',
                    message: 'No files uploaded'
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