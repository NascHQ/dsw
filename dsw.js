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
    
    const rules = {};
    
    // This is the SW file being loaded
    // let's install it and deal with all the fetch information required
    console.info('[ SW ] :: loaded...looking for the config file');
    let d = new Date();
    d = '' + d.getFullYear() + d.getMonth() + d.getDate();
    
    const cacheManager = {
        add: (req, cacheId = 'defaultDSWCached::1') => {
            caches.open(cacheId).then(cache => {
                cache.add(req);
            });
        },
        get: (cacheType, url)=>{
            switch (cacheType) {
                // TODO: look for cached data
                default: {
                    // also used in fetch actions
                    return fetch(url);
                }
            }
        }
    };
    
    function resultOf (url, actions, event) {
        // for now, only the first action is used
        // actually, I don't see by now any reason to use more than one action
        return cacheManager.get('fetch', url.pathname || url).then(response=>{
            // let's validate the response status
            let rulesForStatus = rules[response.status];
            if (rulesForStatus) {
                // in case there are rules for that status
                rulesForStatus.forEach(cur=>{
                    // we look for a match for the current path
                    // and then respond with that
                    return matchAndResolve(rulesForStatus, url, event);
                });
            }
            
            // ok, nothing else to do here
            return response;
        });
    }
    
    // we receive a set of rules and verify if any of the should apply
    function matchAndResolve (rules, url, event) {
        for (let l = rules.length, i = 0; i < l; i++) {
            if(url.pathname.match(rules[i].rx)){
                // if one rule matched, we try to apply it looking for its result
                return resultOf(url.pathname, rules.actions, event);
            }
        }
        // in case no rule matched
        return fetch(url);
    }

    self.addEventListener('activate', function(event) {
        // TODO: remove older cache, here
        debugger;
    });
        
    fetch('/dswfile.json?' + d) // caching for about a day
        .then(result=>{
            result.json().then(dswConfig=>{
                // we will prepare and store the rules here, so it becomes
                // easier to deal with, latelly on each requisition
                Object.keys(dswConfig.dswRules).forEach(heuristic=>{
                    heuristic = dswConfig.dswRules[heuristic];

                    let appl = heuristic['apply'],
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;

                    // preparing extentions to be added to the regexp
                    if(Array.isArray(extensions)){
                        extentions = extensions.join('|');
                    }else{
                        extentions = ".+"
                    }

                    // also preparing status to be added to the regexp
                    status = Array.isArray(status)? status : [status || '*'];

                    // and the path
                    let path = '.+' + (heuristic.match.path || '' ) + '.+';

                    // and now we "build" the regular expression itself!
                    let rx = new RegExp(path + "\\.(("+ extensions +")[\\?.*]?)", 'i');

                    // storing the new, shorter, optimized structure for the rules
                    status.forEach(sts=>{
                        if (sts == 200) {
                            sts = '*';
                        }
                        rules[sts] = rules[sts] || [];
                        rules[sts].push({ rx, actions: appl });
                    });

                    // if it fetches something, and this something is not dynamic
                    if(appl.fetch && !appl.fetch.match(/\$\{.+\}/)){
                        // we fetch it now, and store it in cache
                        cacheManager.add(appl.fetch);
                    }
                });
                
                // and from now on, we listen for any request and treat it
                self.addEventListener('fetch', event=>{
                    debugger;
                    const url = new URL(event.request.url);

                    console.log('FETCHING: ', event.request.url);
                    
                    return matchAndResolve(firstRules, url, event).then(result=>{
                        debugger;
                        event.respondWith(result);
                    });
                    
                    let firstRules = rules['*'];
                    if (firstRules) {
                        console.log(firstRules);
                        return matchAndResolve(firstRules, url, event).then(result=>{
                            debugger;
                            event.respondWith(result);
                        });
                    }
                    return event.respondWith(fetch(event.request.url));

                    // DELETE HERE
                    event.respondWith(fetch(event.request).then(response=>{
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
                    // DELETE UP TO HERE
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
            // we will use the same script, already loaded, for our service worker
            var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
            navigator.serviceWorker.register(src);
            console.info('[ SW ] :: registered');
        }
    };
}
