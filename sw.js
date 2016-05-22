self.addEventListener('fetch', (event)=>{
    console.log('FETCHING: ', event.request.url);
    
    const url = new URL(event.request.url);
    
    if (url.pathname.match(/^\/images\/public\//)) {
        event.respondWith(
            fetch('/images/public/default.png')
        );
    }
    
//    event.respondWith(
//        new Response('Yeah baby, yeah!');
//    );
    //debugger;
});