import { ClientFunction } from 'testcafe';

const fs = require('fs');

const helpers = {
    startServer (port) {
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
            }).listen(port);
            resolve();
        });
    },
    sleep (timing=100, param) {
        return new Promise((resolve) => {
            setTimeout(_ => resolve(param), timing);
        });
    },

    waitTestsToFinish: ClientFunction(() => {
        return new Promise((resolve, reject)=>{
            fullTestsList.then(result=>{
                resolve(result);
            });
        });
    })
};


export default helpers;
