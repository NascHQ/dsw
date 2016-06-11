var isInSWScope = false;
const DSW = {};

// this try/catch is used simply to figure out the current scope
try {
    let SWScope = ServiceWorkerGlobalScope;
    if(self instanceof ServiceWorkerGlobalScope){
        isInSWScope = true;
    }
}catch(e){
    // nothing...just had to find out the scope
}

if (isInSWScope) {
    // This is the SW file being loaded
    // let's install it and deal with all the fetch information required
    console.info('[ SW ] :: loaded...looking for the config file');
    let d = new Date();
    d = '' + d.getFullYear() + d.getMonth() + d.getDate();
    
    fetch('/dswfile.json?' + d) // caching for a day
        .then(result=>{
            result.json().then(dswConfig=>{
                
                const preDefined = {};
                
                // we will prepare and store the rules here, so it becomes
                // easier to deal with, latelly on each requisition
                Object.keys(dswConfig.dswRules).forEach(heuristic=>{
                    heuristic = dswConfig.dswRules[heuristic];
                    let extensions = heuristic.match.extension;
                    extensions = extensions && extensions.join? extensions.join('|') : (extensions || ".+");
                    
                    let status = heuristic.match.status;
                    status = status && status.join? status : [status || '*'];
                    
                    let path = '.+' + (heuristic.match.path || '' ) + '.+';
                    
                    let rx = new RegExp(path + "\\.(("+ extensions +")[\\?.*]?)", 'i');
                    
                    // storing the new, shorter, optimized structure for the rules
                    status.forEach(sts=>{
                        preDefined[sts] = preDefined[sts] || [];
                        preDefined[sts].push({ rx, action: heuristic['apply'] });
                    });
                    
                });
                
                self.addEventListener('fetch', (event)=>{
                    console.log(dswConfig, preDefined);
                    debugger;
                    
                    console.log('FETCHING: ', event.request.url);
                    // s.match(/\.((jpg|png|gif|jpeg)[\?.*]?)/i)
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
                                //response.status = 200;
                                var url = new URL(response.url);

                                if (url.pathname.startsWith('/images/')) {
                                    // in case it is an image, we deliver the default image
                                    return fetch('/images/public/404.jpg');
                                }else{
                                    // otherwise, we simply return our 404 page
                                    return fetch('/404.html');
                                }
                            }

                            // everything was fine...go ahead and be happy, little response!
                            return response;
                        })
                    );
                });
            });
        })
        .catch(err=>{
            console.error('You need to create a dswfile.js in the root directory.\nIt could not be found!');
        });
}else{
    DSW.setup = config => {
        // opening on a page scope...let's install the worker
        if(navigator.serviceWorker){
            var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
            navigator.serviceWorker.register(src);
            console.info('[ SW ] :: registered');
        }
    };
}
