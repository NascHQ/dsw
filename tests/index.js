import { expect } from 'chai';
import { ClientFunction } from 'testcafe';
import helpers from './helpers.js';

//const PAGE_ADDRESS = 'http://localhost:8888/';
const PORT = 8889;
const PAGE_ADDRESS = 'http://localhost:' + PORT + '/';

//const trace = ClientFunction(() => {
//    return new Promise((resolve, reject)=>{
//        window.tracedRequests = [];
//        DSW.trace(/.*/, function (traceData) {
//            window.tracedRequests.push(traceData);
//        });
//        setTimeout(_=>{
//            resolve();
//        }, 300);
//    });
//});

fixture `DSW Setup`
    .page( PAGE_ADDRESS );

test('Setting up DSW', async t => {

    console.log('STARTING THE SERVER');
    await helpers.startServer(PORT);
    console.log('RUNNING THE TESTS');
    const finalOutput = await helpers.waitTestsToFinish();
    console.log('RESULT: ' + finalOutput? 'ok': 'fail');
    expect(finalOutput).to.be.true;

//    const status = await helpers.setupDSW();
//console.log('11111');
//    expect(status.registered).to.be.true;
//    expect(status.appShell).to.be.true;
//    expect(status.ready).to.be.true;
//console.log('22222');
//    await helpers.sleep(1000);
//    console.log('Reloading');
//    await helpers.reloadPage();
//    //await t.navigateTo( PAGE_ADDRESS + '?reloaded');
//    console.log('Reloaded');
    return helpers.sleep(1500);

});

//test('Reloading', async t => {
//    let fn;
//    for(fn in t) {
//        if(typeof t[fn] == 'function' ){ console.log(fn);}
//    }
//    return;
//    let page = await t.navigateTo( PAGE_ADDRESS + '?reloaded');
//    console.log('test 2');
//    await helpers.waitForLoading();
//    console.log('waited for loading');
//    const dswStatus = await helpers.getDSWStatus();
//    console.log(dswStatus);
//    return helpers.sleep(100000);
//});

//test('Start tracing requests', async t => {
//
//    return helpers.sleep(1000);
//});
//
//test('Loading image', async t => {
//
//    return helpers.sleep(1000);
//});
