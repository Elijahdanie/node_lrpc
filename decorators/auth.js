

const checkLimit = async (model, permission, query)  => {

    if(permission.limit > 0){
        const ammount = await model.count({
            where: query
        });

        if(ammount >= permission.limit){
            return {
                message: 'You have reached your limit for this action',
                status: 'restricted'
            }
        }
    }
}

const checkResources = async (permission, id) => {
    if(permission.resources && permission.resources.length > 0){
        if(!permission.resources.includes(id)){
            return {
                message: 'You are not authorized to access this resource',
                status: 'restricted'
            }
        }
    }
}

const LRPCLimit = (model, query) => (target, propertyKey, descriptor) => {

    if(!query){
        query = ['userId']
    }

    // modelMap[key] = {
    //     model,
    //     query
    // }

    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
        const data = args[0];

        if(!data.context){
            return {
                message: 'You are not authorized to access this resource',
                status: 'unauthorized'
            }
        }

        if(!data.context.permissions){
            return {
                message: 'No permissions available for resource limit',
                status: 'error'
            }
        }

        const permission = data.context.permissions;

        const dbProp = query[0];
        let savedKey = query[1];
        let value = savedKey ? data.payload[savedKey] : data.context.id;

        const finalQuery = {
            [dbProp]: value
        }

        const result = await checkLimit(model, permission, finalQuery);

        if(result && result.status !== 'success'){
            return result;
        }

        return originalMethod.apply(this, args);
    }
}


const LRPCResource = (payloadKey) => (target, propertyKey, descriptor) => {
    if(!payloadKey){
        payloadKey = 'id'
    }

    const originalMethod = descriptor.value;

    descriptor.value = async function(...args) {
        const data = args[0];
        const id = data.payload[payloadKey];

        if(!data.context){
            console.warn(`No context for endpoint ${data.request.body.path} Add @LRPCAuth to the endpoint`);
            return {
                message: 'You are not authorized to access this resource',
                status: 'unauthorized'
            }
        }

        if(!data.context.permissions){
            return {
                message: 'No permissions available for resource limit',
                status: 'error'
            }
        }

        const permissions = data.context.permissions;

        if(permissions.resources && permissions.resources.length > 0){

            const result = await checkResources(permissions, id);

            if(result.status !== 'success'){
                return result;
            }
        }

        return originalMethod.apply(this, args);
    }
}

const genericListFetch = async (model, data, keyQuery, permissions, misc = {}) => {
    
    const skip = (data.page - 1) * data.limit;
    const take = data.limit;

    const searchQuery = data.search && !data.search.isArray ? {
        [data.search.key]: {
            contains: data.search.value
        }
    } : data.search.isArray ? {
        [data.search.key]: {
            array_contains: data.search.value
        }
    } : {};

    const total = permissions.resources && permissions.resources.length > 0 ?
        await model.count({
            where: {
                id: {
                    in: permissions.resources
                },
                ...keyQuery,
                ...searchQuery
            }
        }) :
        await model.count({
            where: {
                ...keyQuery,
                ...searchQuery
            }
        });

    const totalPages = Math.ceil(total / data.limit);

    const multipleResults = permissions.resources && permissions.resources.length > 0 ? 
        await model.findMany({
            skip,
            take,
            where: {
                id: {
                    in: permissions.resources
                },
                ...keyQuery,
                ...searchQuery
            },
            ...misc
        }) : 
        await model.findMany({
            skip,
            take,
            where: {
                ...keyQuery,
                ...searchQuery
            },
            ...misc
        });

    return {
        data: multipleResults,
        total,
        page: data.page,
        totalPages
    }
}


module.exports = {
    genericListFetch,
    LRPCLimit,
    LRPCResource
}