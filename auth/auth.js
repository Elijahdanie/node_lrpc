
const { appSecret } = require('../../../../lrpc.config');
const jwt = require('jsonwebtoken');


class AuthService {

    static init = () => {
        const {LRPCEngine} = require('../index.js');
        AuthService.redis = LRPCEngine.instance.redis;
    }

    static cleanToken(token) {
        if (!token) return undefined;

        const tokenArray = token.split(' ');
        return tokenArray.length === 2 ? tokenArray[1] : undefined;
    }

    static compatibility(data) {
        const {id, subscriptions} = data;
        if(subscriptions){
            return 'subscription:Professional'
        }
    }

    static async verifyCustom(token, secret) {
        let properToken = AuthService.cleanToken(token);
        let decoded = jwt.verify(properToken, secret ? secret : appSecret);
        return decoded;
    }

    static async verify(token, path) {

        try {
            const properToken = AuthService.cleanToken(token);
            let decoded = jwt.verify(properToken, appSecret);
            if(decoded.uE){
                decoded = decoded.uE;
            }

            const subScription = decoded.subscription ? decoded.subscription
                                                    : this.compatibility(decoded)
            const permissions = await AuthService.redis.get(subScription);
            if (!permissions) {
                return {
                    message: 'Unauthorized',
                    status: 'unauthorized'
                };
            }

            const parsedPermissions = JSON.parse(permissions);
            const result = AuthService.fetchPermission(parsedPermissions, path);

            if (result && !result.allow) {
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

    static sign(data, exp) {
        const token = jwt.sign(data, appSecret, { expiresIn: exp ? exp : '365d' });
        return `Bearer ${token}`;
    }

    static signCustom(data, secret, exp) {
        const token = jwt.sign(data, secret ? secret : appSecret, { expiresIn: exp ? exp : '365d' });
        return `Bearer ${token}`;
    }

    static fetchPermission(permission, path) {
        const { service, controller, endpoint } = AuthService.parsePath(path);

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