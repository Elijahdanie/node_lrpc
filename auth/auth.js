const { LRPCEngine } = require('../');
const { appSecret } = require('../../../../lrpc.config');

class AuthService {
    static cleanToken(token) {
        if (!token) return undefined;

        const tokenArray = token.split(' ');
        return tokenArray.length === 2 ? tokenArray[1] : undefined;
    }

    static async verify(token, path) {
        try {
            const properToken = Auth.cleanToken(token);

            const decoded = jwt.verify(properToken, appSecret);
            const subScription = decoded.subscription;
            const permissions = await LRPCEngine.instance.redis.get(subScription);

            if (!permissions) {
                return {
                    message: 'Unauthorized',
                    status: 'unauthorized'
                };
            }

            const parsedPermissions = JSON.parse(permissions);
            const result = Auth.fetchPermission(parsedPermissions, path);

            if (!result.allow) {
                return { message: 'You are not authorized to access this endpoint, Upgrade your current plan', status: 'restricted' };
            }

            decoded.permissions = result;

            return { message: 'Authorized', status: 'success', data: decoded };
        } catch (error) {
            console.log(error);
            return {
                message: 'Unable to authenticate user, please login again.',
                status: 'unauthorized',
            }
        }
    }

    static async sign(data, exp) {
        const token = jwt.sign(data, appSecret, { expiresIn: exp ? exp : '365d' });
        return `Bearer ${token}`;
    }

    static fetchPermission(permission, path) {
        const { service, controller, endpoint } = Auth.parsePath(path);

        const restrictions = Object.keys(permission);

        if (restrictions.includes(service)) {
            if (!permission[service][controller]) {
                return {
                    allow: true,
                    limit: 0,
                    resources: []
                };
            }

            const endpoints = permission[service][controller].endpoints;
            if (endpoints) {
                const allowed = endpoints[endpoint] === undefined ? true : endpoints[endpoint];
                return {
                    allow: allowed,
                    limit: permission[service][controller].limit,
                    resources: permission[service][controller].resources
                };
            } else {
                return {
                    allow: true,
                    limit: permission[service][controller].limit,
                    resources: permission[service][controller].resources
                };
            }
        } else {
            return {
                allow: true,
                limit: 0,
                resources: []
            };
        }
    }

    static parsePath(path) {
        const parts = path.split('.');

        return {
            service: parts[0],
            controller: `${parts[1]}`,
            endpoint: `${parts[2]}`
        };
    }
}

module.exports = AuthService;