// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload
// TODO: add support to keepItWarm: use a strategy with promise.race() to always fetch the latest data and update the cache

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import getBestMatchingRX from './best-matching-rx.js';
import indexedDBManager from './indexeddb-Manager.js';

const DSW = {};

// this try/catch is used simply to figure out the current scope
try {
    let SWScope = ServiceWorkerGlobalScope;
    if(self instanceof ServiceWorkerGlobalScope){
        isInSWScope = true;
    }
}catch(e){ /* nothing...just had to find out the scope */ }

if (isInSWScope) {
    
    const DEFAULT_CACHE_NAME = 'defaultDSWCached';
    const DEFAULT_CACHE_VERSION = PWASettings.dswVersion || '1';
    
    function treatBadPage (response, pathName, event) {
        let result;
        DSWManager.rules[response.status || 404].some((cur, idx)=>{
            let matching = pathName.match(cur.rx);
            if (matching) {
                if (cur.action.fetch) {
                    // not found requisitions should
                    // fetch a different resource
                    result = cacheManager.get(cur,
                                              new Request(cur.action.fetch),
                                              event,
                                              matching);
                    return true; // stopping the loop
                }
            }
        });
        return result || response;
    }
    
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
        get: (rule, request, event, matching)=>{
            let actionType = Object.keys(rule.action)[0],
                url = request.url || request,
                pathName = (new URL(url)).pathname;
            
            if (pathName == '/' || pathName.match(/^\/index\.([a-z0-9]+)/i)) {
                // requisitions to / should 
                actionType = 'cache';
            }
            
            let opts = rule.options || {};
            opts.headers = opts.headers || new Headers();
            
            // if the cache options is false, we force it not to be cached
            if(rule.action.cache === false){
                opts.headers.append('pragma', 'no-cache');
                opts.headers.append('cache-control', 'no-cache');
                url = request.url + (request.url.indexOf('?') > 0 ? '&' : '?') + (new Date).getTime();
                pathName = (new URL(url)).pathname;
                request = new Request(url);
            }

            switch (actionType) {
            case 'idb':
            case 'IDB':
            case 'indexedDB': {
                return new Promise((resolve, reject)=>{
                    
                    // function to be used after fetching
                    function treatFetch (response) {
                        if (response && response.status == 200) {
                            let done = _=>{
                                resolve(response);
                            };

                            // store it in the indexedDB
                            indexedDBManager.save(rule.name, response.clone())
                                .then(done)
                                .catch(done); // if failed saving, we still have the reponse to deliver
                        }else{
                            // TODO: treat the not found requests
                        }
                    }
                    
                    indexedDBManager.get(rule.name, request)
                        .then(result=>{
                            // if we did have it in the indexedDB
                            if (result) {
                                // we use it
                                console.log('found something');
                                // TODO: use it
                            }else{
                                // if it was not stored, let's fetch it
                                // fetching
                                result = fetch(request,
                                               opts)
                                            .then(treatFetch)
                                            .catch(treatFetch);
                            }
                        });
                    //indexedDBManager.save(rule.name, request);
                });
            }
            case 'redirect':
            case 'fetch': {
                let tmpUrl = rule.action.fetch || rule.action.redirect;
                
                if (matching.length > 2) {
                    // applying variables
                    matching.forEach(function(cur, idx){
                        tmpUrl = tmpUrl.replace(new RegExp('\\$' + idx, 'i'), cur);
                    });
                }
                
                request = new Request(tmpUrl, {
                    method: opts.method || request.method,
                    headers: opts || request.headers,
                    mode: 'same-origin', // need to set this properly
                    credentials: request.credentials,
                    redirect: 'manual'   // let browser handle redirects
                });
                
                url = request.url;
                pathName = new URL(url).pathname;
                // keep going to be treated with the cache case
            }
            case 'cache': {

                let cacheId = DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION;

                if(rule.action.cache){
                    cacheId =   (rule.action.cache.name || DEFAULT_CACHE_NAME) +
                                '::' +
                                (rule.action.cache.version || DEFAULT_CACHE_VERSION);
                }

                return caches.match(request)
                    .then(result=>{

                        // if it does not exist (cache could not be verified)
                        if (result && result.status != 200) {
                            DSWManager.rules[result.status].some((cur, idx)=>{
                                if (pathName.match(cur.rx)) {
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
                                            return response;
                                        });
                                    }else{
                                        return response;
                                    }
                                } else {
                                    // otherwise...let's see if there is a fallback
                                    // for the 404 requisition
                                    return treatBadPage(response, pathName, event);
                                }
                            };

                            // We will return the result, if successful, or
                            // fetch an anternative resource(or redirect)
                            // and treat both success and failure with the
                            // same "callback"
                            // In case it is a redirect, we also set the header to 302
                            // and really change the url of the response.
                            if (result) {
                                // TODO: here, when it is from a redirect, it should let the browser know about it!
                                if (request.url == event.request.url) {
                                    return result;
                                } else {
                                    // coming from a redirect
                                    return Response.redirect(request.url, 302);
//                                    let req = new Request(request.url, {
//                                        method: opts.method || request.method,
//                                        headers: opts || request.headers,
//                                        mode: 'same-origin', // need to set this properly
//                                        credentials: request.credentials,
//                                        redirect: 'manual'   // let browser handle redirects
//                                    });
//                                    return fetch(req, opts)
//                                            .then(treatFetch)
//                                            .catch(treatFetch);
                                }
                                
                            } else if (actionType == 'redirect') {
                                return Response.redirect(request.url, 302);
                            } else {
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
                let preCache = PWASettings.appShell || [],
                    dbs = [];
                
                Object.keys(dswConfig.dswRules).forEach(heuristic=>{
                    let ruleName = heuristic;
                    heuristic = dswConfig.dswRules[heuristic];
                    heuristic.name = ruleName;

                    let appl = heuristic['apply'],
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;

                    // preparing extentions to be added to the regexp
                    if(Array.isArray(extensions)){
                        let ending = '([\/\&\?]|$)';
                        extensions = '(' + extensions.join(ending+'|') + ending + ')';
                    }else{
                        extensions = '.+';
                    }
                    
                    // and the path
                    let path = /* '((.+)?)' + */ (heuristic.match.path || '' ) + '([.+]?)';

                    // and now we "build" the regular expression itself!
                    let rx = new RegExp(path + '(\\.)?(('+ extensions +')([\\?\&\/].+)?)', 'i');
                    
                    // if it fetches something, and this something is not dynamic
                    // also, if it will redirect to some static url
                    let noVars = /\$[0-9]+/;
                    if ( (appl.fetch && !appl.fetch.match(noVars))
                        ||
                        (appl.redirect && !appl.redirect.match(noVars))) {
                        preCache.push(appl.fetch || appl.redirect);
                    }
                    
                    // in case the rule uses an indexedDB
                    appl.indexedDB = appl.indexedDB || appl.idb || appl.IDB || undefined;
                    if (appl.indexedDB) {
                        dbs.push(appl.indexedDB);
                    }
                    
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
                this.addRule('*', {
                    name: 'serviceWorker',
                    match: { path: /^\/dsw.js(\?=dsw-manager)?$/ },
                    'apply': { cache: { name: DEFAULT_CACHE_NAME, version: DEFAULT_CACHE_VERSION} }
                }, location.href);
                
                // addinf the root path to be also cached by default
                let rootMatchingRX = /^(\/|\/index(\.[0-1a-z]+)?)$/;
                this.addRule('*', {
                    name: 'rootDir',
                    match: { path: rootMatchingRX },
                    'apply': { cache: { name: DEFAULT_CACHE_NAME, version: DEFAULT_CACHE_VERSION} }
                }, rootMatchingRX);
                
                preCache.unshift('/');
                
                // if we've got urls to pre-store, let's cache them!
                // also, if there is any database to be created, this is the time
                if(preCache.length || dbs.length){
                    // we fetch them now, and store it in cache
                    return Promise.all(
                        preCache.map(function(cur) {
                            return cacheManager
                                    .add(cur);
                        }).concat(dbs.map(function(cur) {
                            return indexedDBManager.create(cur);
                        })
                    )).then(resolve);
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
                
                const url = new URL(event.request.url);
                const pathName = (new URL(url)).pathname;
                
                let i = 0,
                    l = (DSWManager.rules['*'] || []).length;
                
                for (; i<l; i++) {
                    let rule = DSWManager.rules['*'][i];
                    let matching = pathName.match(rule.rx);
                    if (matching) {
                        // if there is a rule that matches the url
                        return event.respondWith(
                                cacheManager.get(rule,
                                                 event.request,
                                                 event,
                                                 matching)
                        );
                    }
                }
                // if no rule is applied, we simple request it
                let defaultTreatment = function (response) {
                    if (response && response.status == 200) {
                        return response;
                    } else {
                        return treatBadPage(response, pathName, event);
                    }
                };
                return event.respondWith(
                        fetch(event.request.url, {})
                            // but we will still treat the error pages
                            .then(defaultTreatment)
                            .catch(defaultTreatment)
                );
            });
        }
    };

    self.addEventListener('activate', function(event) {
        if (PWASettings.applyImmediately) {
            event.waitUntil(self.clients.claim());
        }
    });
    
    self.addEventListener('install', function(event) {
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
    });
    
    self.addEventListener('sync', function(event) {
        // TODO: add support to sync event
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
                reject('Service worker not supported');
            }
        });
    };
    
    window.DSW = DSW;
}

export default DSW;
