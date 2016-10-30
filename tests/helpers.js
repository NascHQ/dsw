import { ClientFunction } from 'testcafe';

const fs = require('fs');

const helpers = {
    startServer () {
        var http = require('http');
        return new Promise((resolve, reject)=>{
            http.createServer(function (request, response) {
                response.writeHead(200, {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin' : '*'
                });
                var readStream = fs.createReadStream('./tests/index.html');
                // We replaced all the event handlers with a simple call to readStream.pipe()
                readStream.pipe(response);
            }).listen(1337);
            resolve();
        });
    },
    sleep (timing=100, param) {
        return new Promise((resolve) => {
            setTimeout(_ => resolve(param), timing);
        });
    },
    setupDSW: ClientFunction(() => {
        return new Promise((resolve, reject)=>{
            clientTester.getDSWStatus()
                .then(function(result){
                    resolve(result);
                })
                .catch(function(err){
                    reject(JSON.stringify(err));
                });
//            DSW.setup()
//                .then(function(result){
//                    resolve(result);
//                })
//                .catch(function(err){
//                    reject(JSON.stringify(err));
//                });
        });
    }),
    waitForLoading: ClientFunction(() => {
        return new Promise((resolve, reject)=>{
            window.onload = function pageLoadListener (event) {
                resolve();
            };
        });
    }),
    reloadPage: ClientFunction(() => {
        return location.href = location.href;
        return new Promise((resolve, reject)=>{

        });
    }),
    getDSWStatus: ClientFunction(() => {
        return new Promise((resolve, reject)=>{
            resolve(DSW.status);
        });
    })
};


export default helpers;
