self.addEventListener('fetch', (event)=>{
    console.log('FETCHING: ', event.request.url);
    event.respondWith(
        new Response('Yeah baby, yeah!');
    );
    debugger;
});