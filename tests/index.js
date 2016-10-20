import { ClientFunction } from 'testcafe';

const getWindowLocation = ClientFunction(() => window.location);

fixture `My fixture`
    .page('http://localhost:8888/');

test('My Test', async t => {
    const location = await getWindowLocation();
    console.log(location.href);
});
