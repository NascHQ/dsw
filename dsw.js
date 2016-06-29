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
}catch(e){ /* nothing...just had to find out the scope */ }

if (isInSWScope) {
    
    const DEFAULT_CACHE_NAME = 'defaultDSWCached::1';
    const cacheManager = {
        add: (req, cacheId = DEFAULT_CACHE_NAME) => {
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
        get: (rule, request, event)=>{
            let actionType = Object.keys(rule.action)[0],
                url = request.url;
            
            switch (actionType) {
                // TODO: look for cached data
                case 'redirect':
                case 'fetch': {
                    request = new Request(rule.action.fetch || rule.action.redirect);
                    url = request.url;
                    // keep going to be treated with the cache case
                }
                case 'cache': {
                    
                    let cacheId = DEFAULT_CACHE_NAME;
                    
                    if(rule.action.cache){
                        cacheId =   (rule.action.cache.name || DEFAULT_CACHE_NAME) +
                                    '::' +
                                    (rule.action.cache.version || 1);
                    }
                    
                    event.respondWith(
                        caches.match(request)
                            .then(result=>{
                                if (result.status != 200) {
                                    debugger;
                                    DSWManager.rules[result.status].some((cur, idx)=>{
                                        if (url.match(cur.rx)) {
                                            if (cur.action.fetch) {
                                                // not found requisitions should
                                                // fetch a different resource
                                                result = fetch(cur.action.fetch, cur.options);
                                                return true; // stopping the loop
                                            }
                                        }
                                    });
                                    // in case there is no treatment for that
                                    return result;
                                }else{
                                    return result || fetch(request, rule.options || {})
                                            .then(function(response) {
                                            // after retrieving it, we cache it
                                            if (response.status == 200) {
                                                return caches.open(cacheId).then(function(cache) {
                                                    cache.put(request, response.clone());
                                                    console.log('[ dsw ] :: Result was not in cache, was loaded and added to cache now', url);
                                                    return response;
                                                });
                                            } else {
                                                debugger;
                                            }
                                        });
                                }
                            }));
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
        
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
                debugger;
                
                const url = new URL(event.request.url);
                
                let i = 0,
                    l = (DSWManager.rules['*'] || []).length;
                
                for (; i<l; i++) {
                    let rule = DSWManager.rules['*'][i];
                    if (event.request.url.match(rule.rx)) {
                        // if there is a rule that matches the url
                        return cacheManager.get(rule, event.request, event);
                    }
                }
                // if no rule is applied, we simple request it
                return event.respondWith(fetch(event.request.url, {}));
            });
        }
    };
    
    

    self.addEventListener('activate', function(event) {
        debugger;
        
        if (PWASettings.applyImmediately) {
            event.waitUntil(self.clients.claim());
        }
    });
    self.addEventListener('install', function(event) {
        debugger;
        
        // TODO: maybe remove older cache, here?
        
        if (PWASettings.applyImmediately) {
            event.waitUntil(self.skipWaiting().then(_=>{
                return DSWManager.setup(PWASettings);
            }));
        }else{
            event.waitUntil(DSWManager.setup(PWASettings));
        }
    });
    self.addEventListener('message', function(event) {
        // TODO: add support to message event
        debugger;
    });
    self.addEventListener('sync', function(event) {
        // TODO: add support to sync event
        debugger;
    });
    
    DSWManager.startListening();
    
}else{
    DSW.setup = config => {
        return new Promise((resolve, reject)=>{
            // opening on a page scope...let's install the worker
            if(navigator.serviceWorker){
                if (!navigator.serviceWorker.controller) {
                    // we will use the same script, already loaded, for our service worker
                    var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
                    navigator.serviceWorker
                        .register(src + '?dsw-manager')
                        .then(SW=>{
                            console.info('[ SW ] :: registered');
                            resolve(navigator.serviceWorker.ready);
                        });
                }
            }else{
                reject("Service worker not supported");
            }
        });
    };
}
