import indexedDBManager from './indexeddb-manager.js';

const DEFAULT_CACHE_NAME = 'defaultDSWCached';
let DEFAULT_CACHE_VERSION = null;

let DSWManager,
    PWASettings,
    goFetch;

// finds the real size of an utf-8 string
function lengthInUtf8Bytes(str) {
    // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
    var m = encodeURIComponent(str).match(/%[89ABab]/g);
    return str.length + (m ? m.length : 0);
}

const cacheManager = {
    setup: (DSWMan, PWASet, ftch)=>{
        PWASettings = PWASet;
        DSWManager = DSWMan;
        goFetch = ftch;
        DEFAULT_CACHE_VERSION = PWASettings.dswVersion || '1';
        indexedDBManager.setup(cacheManager);
    },
    registeredCaches: [],
    createDB: db=>{
        return indexedDBManager.create(db);
    },
    // Delete all the unused caches for the new version of the Service Worker
    deleteUnusedCaches: keepUnused=>{
        if (!keepUnused) {
            return caches.keys().then(keys=>{
                cacheManager.registeredCaches;
                return Promise.all(keys.map(function(key) {
                    if (cacheManager.registeredCaches.indexOf(key) < 0) {
                        return caches.delete(key);
                    }
                }));
            });
        }
    },
    // return a name for a default rule or the name for cache using the version
    // and a separator
    mountCacheId: rule => {
        let cacheConf = rule.action.cache;
        if (cacheConf) {
            return (cacheConf.name || DEFAULT_CACHE_NAME) +
                    '::' +
                    (cacheConf.version || DEFAULT_CACHE_VERSION);
        }
        return DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION;
    },
    register: rule=>{
        cacheManager.registeredCaches.push(cacheManager.mountCacheId(rule));
    },
    put: (rule, request, response) => {
        let cloned = response.clone();
        return caches.open(typeof rule == 'string'? rule: cacheManager.mountCacheId(rule))
            .then(function(cache) {
                cache.put(request, cloned);
                return response;
            });
    },
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
    get: (rule, request, event, matching)=>{
        let actionType = Object.keys(rule.action)[0],
            url = request.url || request,
            pathName = (new URL(url)).pathname;

        if (pathName == '/' || pathName.match(/^\/index\.([a-z0-9]+)/i) && rule.action.cache !== false) {
            // requisitions to / should be cached by default
            rule.action.cache = rule.action.cache || {};
        }

        let opts = rule.options || {};
        opts.headers = opts.headers || new Headers();
//
//        // if the cache options is false, we force it not to be cached
//        if(rule.action.cache === false){
//            opts.headers.append('pragma', 'no-cache');
//            opts.headers.append('cache-control', 'no-cache');
//            url = request.url + (request.url.indexOf('?') > 0 ? '&' : '?') + (new Date).getTime();
//            pathName = (new URL(url)).pathname;
//            request = new Request(url);
//        }

        switch (actionType) {
        case 'idb':
        case 'IDB':
        case 'indexedDB': {
            return new Promise((resolve, reject)=>{
                // function to be used after fetching
                function treatFetch (response) {
                    if (response && response.status == 200) {
                        // with success or not(saving it), we resolve it
                        let done = _=>{
                            resolve(response);
                        };

                        // store it in the indexedDB
                        indexedDBManager.save(rule.name, response.clone(), request, rule)
                            .then(done)
                            .catch(done); // if failed saving, we still have the reponse to deliver
                    }else{
                        // if it failed, we can look for a fallback
                        url = request.url;
                        pathName = new URL(url).pathname;
                        return DSWManager.treatBadPage(response, pathName, event);
                    }
                }

                // let's look for it in our cache, and then in the database
                // (we use the cache, just so we can user)
                indexedDBManager.get(rule.name, request)
                    .then(result=>{
                        // if we did have it in the indexedDB
                        if (result) {
                            // we use it
                            return treatFetch(result);
                        }else{
                            // if it was not stored, let's fetch it
                            request = DSWManager.createRequest(request, event, matching);
                            return fetch(request, opts)
                                .then(treatFetch)
                                .catch(treatFetch);
                        }
                    });
            });
        }
        case 'redirect':
        case 'fetch': {
            request = DSWManager.createRedirect(rule.action.fetch || rule.action.redirect,
                                                event,
                                                matching);
            url = request.url;
            pathName = new URL(url).pathname;
            // keep going to be treated with the cache case
        }
        case 'cache': {

            let cacheId;

            if(rule.action.cache){
                cacheId = cacheManager.mountCacheId(rule);
            }
            
            // look for the request in the cache
            return caches.match(request)
                .then(result=>{
                    // if it does not exist (cache could not be verified)
                    if (result && result.status != 200) {
                        // look for rules that match for the request and its status
                        (DSWManager.rules[result.status]||[]).some((cur, idx)=>{
                            if (pathName.match(cur.rx)) {
                                // if a rule matched for the status and request
                                // and it tries to fetch a different source
                                if (cur.action.fetch || cur.action.redirect) {
                                    // problematic requests should
                                    // fetch a different resource
                                    result = fetch(cur.action.fetch || cur.action.redirect,
                                                  cur.action.options);
                                    return true; // stopping the loop
                                }
                            }
                        });
                        // we, then, return the promise of the failed result(for it
                        // could not be loaded and was not in cache)
                        return result;
                    }else{
                        // We will return the result, if successful, or
                        // fetch an anternative resource(or redirect)
                        // and treat both success and failure with the
                        // same "callback"
                        // In case it is a redirect, we also set the header to 302
                        // and really change the url of the response.
                        if (result) {
                            // when it comes from a redirect, we let the browser know about it
                            // or else...we simply return the result itself
                            if (request.url == event.request.url) {
                                return result;
                            } else {
                                // coming from a redirect
                                return Response.redirect(request.url, 302);
                            }

                        } else if (actionType == 'redirect') {
                            // if this is supposed to redirect
                            return Response.redirect(request.url, 302);
                        } else {
                            // this is a "normal" request, let's deliver it
                            // but we will be using a new Request with some info
                            // to allow browsers to understand redirects in case
                            // it must be redirected later on
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
                                            return response;
                                        });
                                    }else{
                                        return response;
                                    }
                                } else {
                                    // otherwise...let's see if there is a fallback
                                    // for the 404 requisition
                                    return DSWManager.treatBadPage(response, pathName, event);
                                }
                            };
                            let req = new Request(request.url, {
                                method: opts.method || request.method,
                                headers: opts || request.headers,
                                mode: 'same-origin', // need to set this properly
                                credentials: request.credentials,
                                redirect: 'manual'   // let browser handle redirects
                            });

                            return fetch(req, opts)
                                    .then(treatFetch)
                                    .catch(treatFetch);
                        }
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

export default cacheManager;
