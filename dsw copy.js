// TODO: add support to keepItHot: use a strategy with promise.race to always fetch the latest data and update the cache
// TODO: add support to send the fetch options

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
    
    const cacheManager = {
        add: (req, cacheId = 'defaultDSWCached::1') => {
            return new Promise((resolve, reject)=>{
                caches.open(cacheId).then(cache => {
                    cache.add(req);
                    resolve();
                }).catch(err=>{
                    console.error(err);
                    resolve();
                });
            });
        },
        get: (rule, url, event)=>{
            let actionType = Object.keys(rule.action)[0];
            
            switch (actionType) {
                // TODO: look for cached data
                case 'cache': {
                    let cacheId = rule.action.cache.name+'::'+(rule.action.cache.version || 1)
                    return caches.match(url)
                        .then(result=>{
                            debugger;
                            if (result) {
                                console.log('[ dsw ] :: Result was in cache: ', url);
                                return result;
                            }else{
                                return fetch(event.request).then(function(response) {
                                    // after retrieving it, we cache it
                                    debugger;
                                    return caches.open(cacheId).then(function(cache) {
                                        cache.put(event.request, response.clone());
                                        console.log('[ dsw ] :: Result was not in cache, was loaded and added to cache now', url);
                                        return response;
                                    });  
                                });
                            }
                        });
                }
                default: {
                    // also used in fetch actions
                    return fetch(url);
                }
            }
        }
    };
    
    const DSWManager = {
        rules: {},
        addRule (sts, rule, rx) {
            this.rules[sts] = this.rules[sts] || [];
            this.rules[sts].push({
                rx,
                action: rule['apply']
            });
            return this;
        },
        setup (dswConfig) {
            return new Promise((resolve, reject)=>{
                // we will prepare and store the rules here, so it becomes
                // easier to deal with, latelly on each requisition
                let preCache = [];
                Object.keys(dswConfig.dswRules).forEach(heuristic=>{
                    heuristic = dswConfig.dswRules[heuristic];

                    let appl = heuristic['apply'],
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;

                    // preparing extentions to be added to the regexp
                    if(Array.isArray(extensions)){
                        extensions = extensions.join('|');
                    }else{
                        extensions = ".+"
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
                        this.addRule(sts, heuristic, rx);
                    });

                    // if it fetches something, and this something is not dynamic
                    if(appl.fetch && !appl.fetch.match(/\$\{.+\}/)){
                        preCache.push(appl.fetch);
                    }
                });
                
                if(preCache.length){
                    // we fetch them now, and store it in cache
                    return Promise.all(
                        preCache.map(function(cur) {
                            return cacheManager
                                    .add(cur);
                        })
                    ).then(resolve);
                }else{
                    resolve();
                }
            });
        },
        getRulesBeforeFetching () {
            // returns all the rules for * or 200
            return this.rules['*'] || false;
        },
        lookForCachedContent (rules=[], url, event) {
            return new Promise((resolve, reject)=>{
                let l = rules.length,
                    i = 0;
                
                for(; i<l; i++){
                    //console.log(rules[i]);
                    if(url.href.match(rules[i].rx)){
                        // if there is a rule that matches the request
                        // we look for its content in some of the caches
                        return cacheManager.get(rules[i], url, event);
                    }
                }
                resolve();
            });
        },
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
                debugger;
                
                const url = new URL(event.request.url);

                // for all the rules in * or 200
                // we:
                // (before fetching it)
                // 1) verify if the rule matches with the url
                // 1.1) if TRUE
                // 1.2) apply the rule:
                // 1.2.1) if any kind of cache
                // 1.2.1.1) look for it in the cache
                // 1.2.1.2) if it is in the cache
                // 1.2.1.2.1) returns it
                // 1.2.1.2) if it is not in the cache
                // 1.2.1.2.2) fetch it
                // 1.2.1.3) if it is fetch
                // 1.2.1.3.1) fetch it
                // 1.1) if FALSE
                // 1.3) fetch it
                // (after fetching it)
                // 2) verify if there are rules for the status
                // 2.1) if TRUE
                // 2.1.1) apply the rule:
                // 2.1.1.1) if any kind of cache (and status is 200)
                // 2.1.1.1.1) store the result in cache
                // 2.1.2) return the response itself
                // 2.1.) 
                // 2.2) if FALSE
                // 2.3) return the response itself
                // 

                let rulesBeforeFetching = this.getRulesBeforeFetching();
                if (rulesBeforeFetching) {
                    this.lookForCachedContent(rulesBeforeFetching, url, event)
                        .then(result=>{
                            // not cached yet, go for it, boy!
                            console.log('FETCHING: ', event.request.url);
                            debugger;
                            return event.respondWith(result || fetch(event.request.clone()));
                        });
                }
            });
        }
    };

    self.addEventListener('activate', function(event) {
        // TODO: remove older cache, here
        debugger;
        DSWManager.startListening();
    });
    self.addEventListener('install', function(event) {
        debugger;
        event.waitUntil(DSWManager.setup(PWASettings));
        setTimeout(_=>{
            if(!DSWManager.rules){
                event.skipWaiting();
            }
        }, 5000);
            //.then(DSWManager.startListening);
    });
    self.addEventListener('message', function(event) {
        // TODO: add support to message event
        //debugger;
    });
    self.addEventListener('sync', function(event) {
        // TODO: add support to sync event
        //debugger;
    });
    
    DSWManager.startListening();
    
}else{
    DSW.setup = config => {
        // opening on a page scope...let's install the worker
        if(navigator.serviceWorker && !navigator.serviceWorker.controller){
            // we will use the same script, already loaded, for our service worker
            var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
            navigator.serviceWorker
                .register(src)
                .then(SW=>{
                    console.info('[ SW ] :: registered');
                });
        }
    };
}
