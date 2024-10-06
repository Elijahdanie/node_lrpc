import io from 'socket.io-client';
import FormData from 'form-data';
import axios from 'axios';
	export type Status = 'success' | 'error' | 'unauthorized' | 'notFound' | 'restricted' | 'validationError';
        var socket: any;
        var token = '';
        export const setToken = (Token: string) => {
            token = Token;
        }
        export const request = async (procedure: string, data: any) => {
    
            const url = import.meta.env.VITE_GATEWAY_URL;
            if(url){
                const response = await axios.post(url, {
                        path: procedure,
                        data
                    },
                    {
                        headers: {
                            Authorization: token
                        }
                    });
                return response;
            } else {
                return {
                    data: {
                        message: 'Gateway URL not set',
                        status: 'error'
                    }
                }
            }
        }

        export const disconnectSocket = () => {
            if(socket){
                socket.disconnect();
            }
        }

        export const requestSocket = async (url: string, procedure: string, data: any, onMessage: (message: any) => void) => {
            try {

                const result = await request(procedure, data);

                if(result.data.status !== 'success'){
                    return result;
                }

                const socket = io(url, {
                    query: {
                        token,
                        path: procedure
                    }
                });
                socket.on('message', (message: any) => {
                    onMessage(message);
                });
                socket.connect();

                    return result;
                }  catch(error) {
                return {
                    data: {
                        message: 'Failed to set up socket connection',
                        status: 'error'
                    }
                }
        }
    }
    
        export const formUpload = async (procedure: string, data: any, files: any[], onUploadProgress: (progress: any) => void) => {
            
            const url = import.meta.env.VITE_MEDIA_URL;
            if(url){
                const formData = new FormData();
                for(const key in data){
                    // console.log(key, data[key])
                    formData.append(key, data[key]); 
                }
                for(const file of files){
                    formData.append('files', file);
                }
                formData.append('path', procedure);
                const response = await axios.post(url, formData, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                        Authorization: token
                    },
                    onUploadProgress
                });
                return response;
            } else {
                return {
                    data: {
                        message: 'Gateway URL not set',
                        status: 'error'
                    }
                }
            }
        }
    