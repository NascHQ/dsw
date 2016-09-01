// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import getBestMatchingRX from './best-matching-rx.js';
import cacheManager from './cache-manager.js';
import goFetch from './go-fetch.js';
import strategies from './strategies.js';

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
        setup (dswConfig={}) {
            // let's prepare both cacheManager and strategies with the
            // current referencies
            cacheManager.setup(DSWManager, PWASettings, goFetch);
            strategies.setup(DSWManager, cacheManager, goFetch);
            
            return new Promise((resolve, reject)=>{
                // we will prepare and store the rules here, so it becomes
                // easier to deal with, latelly on each requisition
                let preCache = PWASettings.appShell || [],
                    dbs = [];
                
                Object.keys(dswConfig.dswRules).forEach(heuristic=>{
                    let ruleName = heuristic;
                    heuristic = dswConfig.dswRules[heuristic];
                    heuristic.name = ruleName;

                    heuristic.action = heuristic.action || heuristic['apply'];
                    let appl = heuristic.action,
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
                        path = (path.join('|') || '') + '|';
                    } else {
                        // "match" may be an object, then we simply use it
                        path = (heuristic.match.path || '' );// aqui + '([.+]?)';
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;
                    }

                    // preparing extentions to be added to the regexp
                    let ending = '([\/\&\?]|$)';
                    if (Array.isArray(extensions)){
                        extensions = '([.+]?)(' + extensions.join(ending+'|') + ending + ')';
                    } else if (typeof extensions == 'string'){
                        extensions = '([.+]?)(' + extensions + ending + ')';
                    } else {
                        extensions = '';
                    }

                    // and now we "build" the regular expression itself!
                    let rx = new RegExp(path + (extensions? '((\\.)(('+ extensions +')([\\?\&\/].+)?))': ''), 'i');
                    
                    // if it fetches something, and this something is not dynamic
                    // also, if it will redirect to some static url
                    let noVars = /\$[0-9]+/;
                    if ( (appl.fetch && !appl.fetch.match(noVars))
                        ||
                        (appl.redirect && !appl.redirect.match(noVars))) {
                        preCache.push({
                            url: appl.fetch || appl.redirect,
                            rule: heuristic
                        });
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
                                    .add(cur.url||cur, null, null, cur.rule);
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
        
        createRequest (request, event, matching) {
            return goFetch(null, request.url || request, event, matching);
        },
        
        createRedirect (request, event, matching) {
            return goFetch(null, request.url || request, event, matching);
        },
        
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
//                if (event) {
//                    return fetch(event.request);
//                }
                // in case there are no rules (happens when chrome crashes, for example)
//                if (!Object.keys(DSWManager.rules).length) {
//                    return DSWManager.setup().then(_=>fetch(event));
//                }
                
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
                            strategies[rule.strategy](
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
                        fetch(goFetch(null, event.request))
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
        // undoing some bad named properties :/
        PWASettings.dswRules = PWASettings.rules || PWASettings.dswRules || {};
        PWASettings.dswVersion = PWASettings.version || PWASettings.dswVersion || '1';
        
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
        //debugger;
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
                            if (config && config.sync) {
                                if ('SyncManager' in window) {
                                    navigator.serviceWorker.ready.then(function(reg) {
                                        return reg.sync.register('myFirstSync');
                                    })
                                    .then(_=>{
                                        resolve({
                                            status: true,
                                            sync: true,
                                            sw: true
                                        });
                                    })
                                    .catch(function(err) {
                                        reject({
                                            status: false,
                                            sync: false,
                                            sw: true,
                                            message: 'Registered Service worker, but was unable to activate sync',
                                            error: err
                                        });
                                    });
                                } else {
                                    reject({
                                        status: false,
                                        sync: false,
                                        sw: true,
                                        message: 'Registered Service worker, but was unable to activate sync',
                                        error: null
                                    });
                                }
                            } else {
                                resolve({
                                    status: true,
                                    sync: false,
                                    sw: true
                                });
                            }
                        })
                        .catch(err=>{
                            reject({
                                status: false,
                                sync: false,
                                sw: false,
                                message: 'Failed registering service worker',
                                error: err
                            });
                        });

                }
            }else{
                reject({
                    status: false,
                    sync: false,
                    sw: false,
                    message: 'Service Worker not supported',
                    error: null
                });
            }
        });
    };
    
    if (typeof window !== 'undefined') {
        window.DSW = DSW;
    }
}

export default DSW;
