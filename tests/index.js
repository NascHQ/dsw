import { ClientFunction } from 'testcafe';

const registerSW = ClientFunction(() => {
    return new Promise((resolve, reject)=>{
        DSW.addEventListener('activated', function(){
            resolve(DSW.satus);
        });
    });
});

fixture `DSW fixture`
    .page('http://localhost:8888/');

test('My Test', async t => {
    const status = await registerSW();
    console.log(status);
});
