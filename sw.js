console.log('>>>>>', self);
debugger;
self.addEventListener('fetch', (event)=>{
    console.log('FETCHING: ', event.request.url);
    
    const url = new URL(event.request.url);
    
//    if (url.pathname.match(/^\/images\/public\//)) {
//        event.respondWith(
//            fetch('/images/public/default.png')
//        );
//    }
    
    event.respondWith(
        fetch(event.request).then(response=>{
            // will fetch exactly what was requested
            // but will be able to do something after the fetch
            // and before returning it
            if (response.status === 404) {
                // if it was not found
                var url = new URL(response.url);
                
                if (url.pathname.startsWith('/images/')) {
                    // in case it is an image, we deliver the default image
                    return fetch('/images/public/404.jpg');
                }else{
                    // otherwise, we simply return our 404 page
                    return fetch('/404.html');
                }
            }
            
            return response;
        })
    );
    //debugger;
});