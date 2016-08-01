// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import getBestMatchingRX from './best-matching-rx.js';
import cacheManager from './cache-manager.js';

const DSW = {};

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
                    return caches.match(request).then(result=>{
                        // if failed to fetch and was not in cache, we look
                        // for a fallback response
                        const pathName = (new URL(event.request.url)).pathname;
                        if(result){
                            console.info('From cache(after network failure): ', request.url);
                        }
                        return result || DSWManager.treatBadPage(response, pathName, event);
                    });
                }
                return fetch(request).then(treatIt).catch(treatIt);
            }/*
            // STILL DECIDING IF APPLICABLE
            ,
            'fastest': function fastest (rule, request, event, matching) {
                // Will fetch AND look in the cache.
                // The cached data will be returned faster
                // but once the fetch request returns, it updates
                // what is in the cache (keeping it up to date)
                // TO BE DONE
                // return cacheManager.get(rule,
                //     request,
                //     event,
                //     matching
                '' );
            }*/
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
            (DSWManager.rules[response.status || 404] || []).some((cur, idx)=>{
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
            return new Request(request.url || request, {
                method: request.method || 'GET',
                headers: request.headers || {},
                mode: 'cors',
                cache: 'default'
            });
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
                // if no rule is applied, we simple request it
                let defaultTreatment = function (response) {
                    if (response && response.status == 200) {
                        return response;
                    } else {
                        return DSWManager.treatBadPage(response, pathName, event);
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
