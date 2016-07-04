// TODO: add support to keepItHot: use a strategy with promise.race to always fetch the latest data and update the cache
// TODO: add support to send the fetch options

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import getBestMatchingRX from "./best-matching-rx.js";

const DSW = {};

// this try/catch is used simply to figure out the current scope
try {
    let SWScope = ServiceWorkerGlobalScope;
    if(self instanceof ServiceWorkerGlobalScope){
        isInSWScope = true;
    }
}catch(e){ /* nothing...just had to find out the scope */ }

if (isInSWScope) {
    
    // TODO: use this to get the best fitting rx, instead of the first that matches
    // reference from https://gist.github.com/felipenmoura/e02c8d8cfdea101fc6265a94321e02df
    function getBestMatchingRX(str){
        let bestMatchingRX;
        let bestMatchingGroup = Number.MAX_SAFE_INTEGER;
        rx.forEach(function(currentRX){
            const regex = new RegExp(currentRX);
            const groups = regex.exec(str);
            if (groups && groups.length < bestMatchingGroup){
                bestMatchingRX = currentRX;
                bestMatchingGroup = groups.length;
            }
            console.log(groups);
        });
        return bestMatchingRX;
    }

    
    const DEFAULT_CACHE_NAME = 'defaultDSWCached';
    const DEFAULT_DB_NAME = 'defaultDSWDB';
    const DEFAULT_CACHE_VERSION = PWASettings.dswVersion || '1';
    
    const cacheManager = {
        add: (req, cacheId = DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION) => {
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
                url = request.url,
                pathName = new URL(location.href).pathname;
            
            if (pathName == '/' || pathName.match(/\/index\.([a-z0-9]+)/i)) {
                // requisitions to / should 
                actionType = 'cache';
            }
            
            let opts = rule.options || {};
            opts.headers = opts.headers || new Headers();

            switch (actionType) {
                // TODO: look for other kinds of cached data
                case 'idb':
                case 'IDB':
                case 'indexedDB': {
                    return new Promise((resolve, reject)=>{
                        // aqui
                    });
                    break;
                }
                case 'sessionStorage': {
                    //break; // TODO: see if there is support, somehow!
                }
                case 'redirect':
                case 'fetch': {
                    request = new Request(rule.action.fetch || rule.action.redirect);
                    url = request.url;
                    // keep going to be treated with the cache case
                }
                case 'cache': {
                    
                    let cacheId = DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION;
                    
                    if(rule.action.cache){
                        cacheId =   (rule.action.cache.name || DEFAULT_CACHE_NAME) +
                                    '::' +
                                    (rule.action.cache.version || DEFAULT_CACHE_VERSION);
                    }
                    // if the cache options is false, we force it not to be cached
                    if(rule.action.cache === false){
                        opts.headers.append('pragma', 'no-cache');
                        opts.headers.append('cache-control', 'no-cache');
                        url = request.url + (request.url.indexOf('?') > 0 ? '&' : '?') + (new Date).getTime();
                        request = new Request(url);
                    }
                    
                    return caches.match(request)
                        .then(result=>{

                            // if it does not exist (cache could not be verified)
                            if (result && result.status != 200) {
                                DSWManager.rules[result.status].some((cur, idx)=>{
                                    if (url.match(cur.rx)) {
                                        if (cur.action.fetch) {
                                            // not found requisitions should
                                            // fetch a different resource
                                            result = fetch(cur.action.fetch,
                                                          cur.action.options);
                                            return true; // stopping the loop
                                        }
                                    }
                                });
                                return result;
                            }else{
                                let treatFetch = function (response) {
                                    if(!response.status){
                                        response.status = 404;
                                    }
                                    // after retrieving it, we cache it
                                    // if it was ok
                                    if (response.status == 200) {
                                        // if cache is not false, it will be added to cache
                                        if (rule.action.cache !== false) {
                                            return caches.open(cacheId).then(function(cache) {
                                                cache.put(request, response.clone());
                                                console.log('[ dsw ] :: Result was not in cache, was loaded and added to cache now', url);
                                                
                                                // if the rule told us to redirect it
                                                // we say that using the header status
                                                if (actionType == 'redirect') {
                                                    response.statusText = 'Redirected';
                                                    response.status = 302;
                                                }
                                                
                                                return response;
                                            });
                                        }else{
                                            return response;
                                        }
                                    } else {
                                        // otherwise...let's see if there is a fallback
                                        // for the 404 requisition
                                        DSWManager.rules[response.status].some((cur, idx)=>{
                                            if (url.match(cur.rx)) {
                                                if (cur.action.fetch) {
                                                    // not found requisitions should
                                                    // fetch a different resource
                                                    result = cacheManager.get(cur, event.request, event);
                                                    return true; // stopping the loop
                                                }
                                            }
                                        });
                                        return result || response;
                                    }
                                };

                                // we will return the result, if successful, or
                                // fetch an anternative resource(or redirect)
                                // and treat both success and failure with the
                                // same "callback"
                                return result || fetch(request, opts)
                                        .then(treatFetch)
                                        .catch(treatFetch);
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
                name: rule.name,
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
                    let ruleName = heuristic;
                    heuristic = dswConfig.dswRules[heuristic];
                    heuristic.name = ruleName;

                    let appl = heuristic['apply'],
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;

                    // preparing extentions to be added to the regexp
                    if(Array.isArray(extensions)){
                        let ending = "([\/\&\?]|$)";
                        extensions = '(' + extensions.join(ending+'|') + ending + ')';
                    }else{
                        extensions = ".+"
                    }
                    
                    // and the path
                    let path = '((.+)?)' + (heuristic.match.path || '' ) + '([.+]?)';

                    // and now we "build" the regular expression itself!
                    let rx = new RegExp(path + "(\\.)?(("+ extensions +")([\\?\&\/].+)?)", 'i');
                    //       /images\/((.+)?)(\.)?([\.(.+)[\?.*]?]?)/i
                    
                    // if it fetches something, and this something is not dynamic
                    // also, if it will redirect to some static url
                    if( (appl.fetch && !appl.fetch.match(/\$\{.+\}/))
                        ||
                        (appl.redirect && !appl.redirect.match(/\$\{.+\}/))){
                        preCache.push(appl.fetch || appl.redirect);
                    }
                    
                    // in case the rule uses an indexedDB
//                    let request = indexedDB.open(DEFAULT_DB_NAME || rule.action.indexedDB.name,
//                                    rule.action.indexedDB.version || undefined);
//                    request.onerror = function(event) {
//                        reject(); // TODO: pass something on, here
//                    };
//                    request.onupgradeneeded = function(event) {
//                        let db = event.target.result;
//                        objectStore = db.createObjectStore("customers", { keyPath: "ssn" });
//                    };
                    //heuristic.db = db;
                    
                    
                    // preparing status to store the heuristic
                    status = Array.isArray(status)? status : [status || '*'];
                    
                    // storing the new, shorter, optimized structure  of the
                    // rules for all the status that it should be applied to
                    status.forEach(sts=>{
                        if (sts == 200) {
                            sts = '*';
                        }
                        this.addRule(sts, heuristic, rx);
                    });
                });
                
                // adding the dsw itself to cache
                this.addRule("*", {
                    name: 'serviceWorker',
                    match: { path: location.href },
                    "apply": { cache: { name: DEFAULT_CACHE_NAME, version: DEFAULT_CACHE_VERSION} }
                }, location.href);
                
                // addinf the root path to be also cached by default
                let rootMatchingRX = /http(s)?\:\/\/[^\/]+\/([^\/]+)?$/i;
                this.addRule("*", {
                    name: 'rootDir',
                    match: { path: rootMatchingRX },
                    "apply": { cache: { name: DEFAULT_CACHE_NAME, version: DEFAULT_CACHE_VERSION} }
                }, rootMatchingRX);
                
                // if we've got urls to pre-store, let's cache them!
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
                        return event.respondWith(cacheManager.get(rule, event.request, event));
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
    
    window.DSW = DSW;
}

export default DSW;