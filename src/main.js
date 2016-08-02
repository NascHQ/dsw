// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import getBestMatchingRX from './best-matching-rx.js';
import cacheManager from './cache-manager.js';
import goFetch from './go-fetch.js';

const DSW = {};
const REQUEST_TIME_LIMIT = 5000;

// this try/catch is used simply to figure out the current scope
try {
    let SWScope = ServiceWorkerGlobalScope;
    if(self instanceof ServiceWorkerGlobalScope){
        isInSWScope = true;
    }
}catch(e){ /* nothing...just had to find out the scope */ }

if (isInSWScope) {
    
    const DSWManager = {
        rules: {},
        strategies: {
            'offline-first': function offlineFirstStrategy (rule, request, event, matching) {
                // Will look for the content in cache
                // if it is not there, will fetch it,
                // store it in the cache
                // and then return it to be used
                console.info('offline first: Looking into cache for\n', request.url);
                return cacheManager.get(rule,
                     request,
                     event,
                     matching
                );
            },
            'online-first': function onlineFirstStrategy (rule, request, event, matching) {
                // Will fetch it, and if there is a problem
                // will look for it in cache
                function treatIt (response) {
                    if (response.status == 200) {
                        if (rule.action.cache) {
                            // we will update the cache, in background
                            cacheManager.put(rule, request, response).then(_=>{
                                console.info('Updated in cache: ', request.url);
                            });
                        }
                        console.info('From network: ', request.url);
                        return response;
                    }
                    return cacheManager.get(rule, request, event, matching)
                        .then(result=>{
                            // if failed to fetch and was not in cache, we look
                            // for a fallback response
                            const pathName = (new URL(event.request.url)).pathname;
                            if(result){
                                console.info('From cache(after network failure): ', request.url);
                            }
                            return result || DSWManager.treatBadPage(response, pathName, event);
                        });
                }
                return goFetch(rule, request, event, matching).then(treatIt).catch(treatIt);
            },
            'fastest': function fastestStrategy (rule, request, event, matching) {
                // Will fetch AND look in the cache.
                // The cached data will be returned faster
                // but once the fetch request returns, it updates
                // what is in the cache (keeping it up to date)
                const pathName = (new URL(event.request.url)).pathname;
                let treated = false,
                    cachePromise = null;
                function treatFetch (response) {
                    let result = null;
                    if (response.status == 200) {
                        // if we managed to load it from network and it has
                        // cache in its actions, we cache it
                        if (rule.action.cache) {
                            // we will update the cache, in background
                            cacheManager.put(rule, request, response).then(_=>{
                                console.info('Updated in cache: ', request.url);
                            });
                        }
                        console.info('From network (fastest or first time): ', request.url);
                        result = response;
                    } else {
                        // if it failed, we will try and respond with
                        // something else
                        result = DSWManager.treatBadPage(response, pathName, event);
                    }
                    // if cache was still waiting...
                    if(typeof cachePromise == 'function') {
                        // we stop it, the request has returned
                        setTimeout(cachePromise, 10);
                    }
                    return result;
                }
                
                function treatCache (result) {
                    // if it was in cache, we use it...period.
                    return result || new Promise((resolve, reject)=>{
                        // we will wait for the request to end
                        cachePromise = resolve;
                    });
                }
                
                return Promise.race([
                    goFetch(rule, request, event, matching)
                        .then(treatFetch)
                        .catch(treatFetch),
                    cacheManager.get(rule, request, event, matching)
                        .then(treatCache)
                ]);
            }
        },
        addRule (sts, rule, rx) {
            this.rules[sts] = this.rules[sts] || [];
            let newRule = {
                name: rule.name,
                rx,
                strategy: rule.strategy || 'offline-first',
                action: rule['apply']
            };
            this.rules[sts].push(newRule);
            
            // if there is a rule for cache
            if (newRule.action.cache) {
                // we will register it in the cacheManager
                cacheManager.register(newRule);
            }
            return newRule;
        },
        treatBadPage (response, pathName, event) {
            let result;
            (DSWManager.rules[
                    response && response.status? response.status : 404
                ] || [])
                .some((cur, idx)=>{
                    let matching = pathName.match(cur.rx);
                    if (matching) {
                        if (cur.action.fetch) {
                            // not found requisitions should
                            // fetch a different resource
                            console.info('Found fallback rule for ', pathName, '\nLooking for its result');
                            result = cacheManager.get(cur,
                                                      new Request(cur.action.fetch),
                                                      event,
                                                      matching);
                            return true; // stopping the loop
                        }
                    }
                });
            if (!result) {
                console.info('No rules for failed request: ', pathName, '\nWill output the failure');
            }
            return result || response;
        },
        setup (dswConfig) {
            cacheManager.setup(DSWManager, PWASettings);
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
                        extensions,
                        status,
                        path;
                    
                    // in case "match" is an array
                    // we will treat it as an "OR"
                    if (Array.isArray(heuristic.match)) {
                        extensions = [];
                        path = [];
                        heuristic.match.map(cur=>{
                            if (cur.extension) {
                                extensions.push(cur.extension);
                            }
                            if (cur.path) {
                                path.push(cur.path);
                            }
                        });
                        extensions = extensions.join('|');
                        if (extensions.length) {
                            extensions+= '|';
                        }
                        path = (path.join('|') || '([.+]?)') + '|';
                    } else {
                        // "match" may be an object, then we simply use it
                        path = (heuristic.match.path || '' ) + '([.+]?)';
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;
                    }

                    // preparing extentions to be added to the regexp
                    let ending = '([\/\&\?]|$)';
                    if (Array.isArray(extensions)){
                        extensions = '(' + extensions.join(ending+'|') + ending + ')';
                    } else if (typeof extensions == 'string'){
                        extensions = '(' + extensions + ending + ')';
                    } else {
                        extensions = '.+';
                    }

                    // and now we "build" the regular expression itself!
                    let rx = new RegExp(path + '((\\.)(('+ extensions +')([\\?\&\/].+)?))', 'i');
                    
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
                        let addedRule = this.addRule(sts, heuristic, rx);
                    });
                });
                
                // adding the dsw itself to cache
                this.addRule('*', {
                    name: 'serviceWorker',
                    match: { path: /^\/dsw.js(\?=dsw-manager)?$/ },
                    'apply': { cache: { } }
                }, location.href);
                
                // addinf the root path to be also cached by default
                let rootMatchingRX = /^(\/|\/index(\.[0-1a-z]+)?)$/;
                this.addRule('*', {
                    name: 'rootDir',
                    match: { path: rootMatchingRX },
                    'apply': { cache: { } }
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
                            return cacheManager.createDB(cur);
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
        
        createRequest (request) {
            return goFetch(null, request.url || request);
        },
        
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
                
                const url = new URL(event.request.url);
                const pathName = url.pathname;
                
                // in case we want to enforce https
                if (PWASettings.enforceSSL) {
                    if (url.protocol != 'https:' && url.hostname != 'localhost') {
                        return event.respondWith(Response.redirect(
                            event.request.url.replace('http:', 'https:'), 302));
                    }
                }
                
                let i = 0,
                    l = (DSWManager.rules['*'] || []).length;
                
                for (; i<l; i++) {
                    let rule = DSWManager.rules['*'][i];
                    let matching = pathName.match(rule.rx);
                    if (matching) {
                        // if there is a rule that matches the url
                        return event.respondWith(
                            DSWManager.strategies[rule.strategy](
                                rule,
                                event.request,
                                event,
                                matching
                            )
                        );
                    }
                }
                // if no rule is applied, we will request it
                // this is the function to deal with the resolt of this request
                let defaultTreatment = function (response) {
                    if (response && response.status == 200) {
                        return response;
                    } else {
                        return DSWManager.treatBadPage(response, pathName, event);
                    }
                };
                
                // once no rule matched, we simply respond the event with a fetch
                return event.respondWith(
                        goFetch(null, event.request)
                            // but we will still treat the rules that use the status
                            .then(defaultTreatment)
                            .catch(defaultTreatment)
                );
            });
        }
    };

    self.addEventListener('activate', function(event) {
        event.waitUntil(_=>{
            let promises = [];
            if (PWASettings.applyImmediately) {
                promises.push(self.clients.claim());
            }
            promises.push(cacheManager.deleteUnusedCaches(PWASettings.keepUnusedCaches));
            return Promise.all(promises);
        });
    });
    
    self.addEventListener('install', function(event) {
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
                        .register(src)
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
