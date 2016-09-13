// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import logger from './logger.js';
import getBestMatchingRX from './best-matching-rx.js';
import cacheManager from './cache-manager.js';
import goFetch from './go-fetch.js';
import strategies from './strategies.js';
import utils from './utils.js';

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
        requestId: 0,
        tracking: {},
        trackMoved: {},
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
            } else {
                // if it is supposed NOT to cache
                if (newRule.action.cache === false) {
                    newRule.strategy = 'online-first';
                }
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
                        if (cur.action.redirect && !cur.action.fetch) {
                            cur.action.fetch = cur.action.fetch;
                        }
                        if (cur.action.fetch) {
                            DSWManager.traceStep(event.request, 'Found fallback rule', {
                                rule: cur
                            });
                            // not found requisitions should
                            // fetch a different resource
                            let req = new Request(cur.action.fetch);
                            req.requestId = event.request.requestId;
                            req.traceSteps = event.request.traceSteps;
                            result = cacheManager.get(cur,
                                                      req,
                                                      event,
                                                      matching);
                            return true; // stopping the loop
                        }
                    }
                });
            if (!result) {
                DSWManager.traceStep(event.request, 'No fallback found. Request failed');
                //logger.info('No rules for failed request: ', pathName, '\nWill output the failure itself');
            }
            return result || response;
        },
        setup (dswConfig={}) {
            // let's prepare both cacheManager and strategies with the
            // current referencies
            utils.setup(DSWManager, PWASettings);
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
            return goFetch(null, request, event, matching);
        },
        
        createRedirect (request, event, matching) {
            return goFetch(null, request, event, matching);
        },
        
        traceStep (request, step, data, fill=false, moved=false) {
            // if there are no tracking listeners, this request will not be tracked
            if (DSWManager.tracking) {
                let id = request.requestId;
                request.traceSteps = request.traceSteps || [];
                data = data || {};
                if (fill) {
                    data.url = request.url;
                    data.type = request.type;
                    data.method = request.method;
                    data.redirect = request.redirect;
                    data.referrer = request.referrer;
                }
                request.traceSteps.push({ step, data });
                if (moved) {
                    DSWManager.trackMoved[moved.url] = moved;
                }
            }
        },
        
        respondItWith (event, response) {
            // respond With This
            // first of all...we respond the event
            event.respondWith(new Promise((resolve, reject)=>{
                if (typeof response.then == 'function') {
                    response.then(result=>{
                        let response = result.clone();

                        // then, if it has been tracked, let's tell the listeners
                        if (DSWManager.tracking && response.status != 302) {
                            response.text().then(result=>{
                                // if the result is a string (text, html, etc)
                                // we will preview only a small part of it
                                if ((result[0] || '').charCodeAt(0) < 128) {
                                    result = result.substring(0, 180) +
                                             (result.length > 180? '...': '');
                                }
                                DSWManager.traceStep(
                                    event.request,
                                    'Responded',
                                    {
                                        response: {
                                            status: response.status,
                                            statusText: response.statusText,
                                            type: response.type,
                                            method: response.method,
                                            url: response.url,
                                        },
                                        preview: result
                                    }, true);
                                let tracker;
                                let traceBack = (port, key)=>{
                                    // sending the trace information back to client
                                    port.postMessage({
                                        id: event.request.requestId,
                                        src: event.request.traceSteps[0].data.url,
                                        method: event.request.traceSteps[0].data.method,
                                        steps: event.request.traceSteps
                                    });
                                };
                                for(tracker in DSWManager.tracking) {
                                    if (event.request.url.match(tracker)) {
                                        DSWManager.tracking[tracker].ports.forEach(traceBack);
                                        break;
                                    }
                                }
                            });
                        }
                        resolve(result);
                    });
                } else {
                    resolve(response);
                }
            }));
        },
        
        broadcast (message) {
            return clients.matchAll().then(result=>{
                result.forEach(cur=>{
                    cur.postMessage(message);
                });
            });
        },
        
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
                
                DSWManager.requestId = 1 + (DSWManager.requestId || 0);
                
                if (DSWManager.trackMoved[event.request.url]) {
                    let movedInfo = DSWManager.trackMoved[event.request.url];
                    event.request.requestId = movedInfo.id;
                    event.request.traceSteps = movedInfo.steps;
                    delete DSWManager.trackMoved[event.request.url];
                } else {
                    event.request.requestId = DSWManager.requestId;
                    DSWManager.traceStep(event.request, 'Arived in Service Worker', {}, true);
                }
                
                // in case there are no rules (happens when chrome crashes, for example)
                if (!Object.keys(DSWManager.rules).length) {
                    return DSWManager.setup(PWASettings).then(_=>fetch(event));
                }
                
                const url = new URL(event.request.url);
                const pathName = url.pathname;
                
                // in case we want to enforce https
                if (PWASettings.enforceSSL) {
                    if (url.protocol != 'https:' && url.hostname != 'localhost') {
                        DSWManager.traceStep(event.request, 'Redirected from http to https');
                        return DSWManager.respondItWith(event, Response.redirect(
                            event.request.url.replace('http:', 'https:'), 302));
                    }
                }
                
                // get the best fiting rx for the path, to find the rule that
                // matches the most
                let matchingRule = getBestMatchingRX(pathName,
                                                 DSWManager.rules['*']);
                if (matchingRule) {
                    // if there is a rule that matches the url
                    DSWManager.traceStep(
                        event.request,
                        'Best matching rule found: "' + matchingRule.rule.name + '"',
                        {
                            rule: matchingRule.rule,
                            url: event.request.url
                        });
                    return DSWManager.respondItWith(
                        event,
                        // we apply the right strategy for the matching rule
                        strategies[matchingRule.rule.strategy](
                            matchingRule.rule,
                            event.request,
                            event,
                            matchingRule.matching
                        )
                    );
                }
                
                // if no rule is applied, we will request it
                // this is the function to deal with the resolt of this request
                let defaultTreatment = function (response) {
                    if (response && (response.type == 'opaque' || response.status == 200)) {
                        return response;
                    } else {
                        return DSWManager.treatBadPage(response, pathName, event);
                    }
                };
                
                // once no rule matched, we simply respond the event with a fetch
                return DSWManager.respondItWith(
                        event,
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
        const ports = event.ports;
        
        if (event.data.trackPath) {
            let tp = event.data.trackPath;
            DSWManager.tracking[tp] = {
                rx: new RegExp(tp, 'i'),
                ports: ports
            };
            return;
        }
    });
    
    self.addEventListener('push', function(event) {
        console.log('Push message', event);

        var title = 'Push message';

        event.waitUntil(
        self.registration.showNotification(title, {
            'body': 'The Message',
            'icon': 'images/icon.png'
        }));
    });
    
    // When user clicks/touches the notification, we shall close it and open
    // or focus the web page
    self.addEventListener('notificationclick', function(event) {
        console.log('Notification click: tag', event.notification.tag);
        event.notification.close();

        var url = 'TODO';
        
        event.waitUntil(
            // let's look for all windows(or frames) that are using our sw
            clients.matchAll({
                type: 'window'
            }).then(function(windowClients) {
                console.log('WindowClients', windowClients);
                // and let's see if any of these is already our page
                for (var i = 0; i < windowClients.length; i++) {
                    var client = windowClients[i];
                    console.log('WindowClient', client);
                    // if it is, we simply focus it
                    if (client.url === url && 'focus' in client) {
                        return client.focus();
                    }
                }
                // if it is not opened, we open it
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
        );
    });

    
    self.addEventListener('sync', function(event) {
        // TODO: add support to sync event
        //debugger;
    });
    
    DSWManager.startListening();
    
}else{
    
    window.addEventListener('message', event=>{
//        debugger;
        console.log(event, 'something arrived');
    });

    DSW.trace = function (match, options, callback) {
        
        if (!callback && typeof options == 'function') {
            callback = options;
            options = {};
        }
        
        var messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = function(event) {
            callback(event.data);
        };
        navigator.serviceWorker
            .controller
            .postMessage({ trackPath: match }, [messageChannel.port2]);
    };
    
    DSW.sendMessage = (message, waitForAnswer=false)=>{
        return new Promise((resolve, reject)=>{
            var messageChannel = new MessageChannel();
            
            // in case the user expects an answer from the SW after sending
            // this message...
            if (waitForAnswer) {
                // we will wait for it, and then resolve or reject only when
                // the SW has answered
                messageChannel.port1.onmessage = function(event) {
                    if (event.data.error) {
                        reject(event.data.error);
                    } else {
                        resolve(event.data);
                    }
                };
            } else {
                // otherwise, we simply resolve it, after 10ms (just to use another flow)
                setTimeout(resolve, 10);
            }
            navigator.serviceWorker
                .controller
                .postMessage(message, [messageChannel.channel.port2]);
        });
    };
    
    DSW.onNetworkStatusChange = callback=>{
        let cb = function () {
            callback(navigator.onLine);
        };
        window.addEventListener('online',  cb);
        window.addEventListener('offline', cb);
        // in case we are already offline, we will trigger now, the callback
        // this way, fevelopers will know right away that their app has loaded
        // offline
        if(!navigator.onLine) {
            cb();
        }
    };
    DSW.offline = _=>{
        return !navigator.onLine;
    };
    DSW.online = _=>{
        return navigator.onLine;
    };
    
    DSW.enableNotifications = _=>{
        return new Promise((resolve, reject)=>{
            if (navigator.onLine) {
                navigator.serviceWorker.ready.then(function(reg) {
                    let req = reg.pushManager.subscribe({
                        userVisibleOnly: true
                    });
                    return req.then(function(sub) {
                        resolve(sub);
                    }).catch(reason=>{
                        reject(reason || 'Not allowed by user');
                    });
                });
            } else {
                reject('Must be connected to enable notifications');
            }
        });
    };
    
    DSW.notify = (title='Untitled', options={})=>{
        return new Promise((resolve, reject)=>{
            DSW.enableNotifications().then(_=>{
                const opts = {
                    body: options.body || '',
                    icon: options.icon || false
                };
                let n = new Notification(title, opts);
                if (options.duration) {
                    setTimeout(_=>{
                        n.close();
                    }, options.duration * 1000);
                }
                resolve(n);
            }).catch(reason=>{
                reject(reason);
            });
        });
    };
    
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
                            logger.info('Registered service worker');
                        
                            // setting up notifications
                            if (PWASettings.notification && PWASettings.notification.auto) {
                                navigator.serviceWorker.ready.then(function(reg) {
                                    reg.pushManager.subscribe({
                                        userVisibleOnly: true
                                    }).then(function(sub) {
                                        logger.info('Subscribed to notification server:', sub.endpoint);
                                    });
                                });
                            }

                            if (config && config.sync) {
                                if ('SyncManager' in window) {
                                    navigator.serviceWorker.ready.then(function(reg) {
                                        return reg.sync.register('syncr');
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

                } else {
                    // service worker was already registered and is active
                    // setting up traceable requests
                    if (config.trace) {
                        navigator.serviceWorker.ready.then(function(reg) {
                            let match;
                            for(match in config.trace){
                                DSW.trace(match, config.trace[match]);
                            }
                        });
                    }
                }
            } else {
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
