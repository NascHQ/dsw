// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import logger from './logger.js';
import getBestMatchingRX from './best-matching-rx.js';
import cacheManager from './cache-manager.js';
import goFetch from './go-fetch.js';
import strategies from './strategies.js';

const DSW = {};
const REQUEST_TIME_LIMIT = 5000;
const COMM_HAND_SHAKE = 'seting-dsw-communication-up';

// this try/catch is used simply to figure out the current scope
try {
    let SWScope = ServiceWorkerGlobalScope;
    if(self instanceof ServiceWorkerGlobalScope){
        isInSWScope = true;
    }
}catch(e){ /* nothing...just had to find out the scope */ }

if (isInSWScope) {
    
    const DSWManager = {
        tracking: {},
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
                            logger.info('Found fallback rule for ', pathName, '\nLooking for its result');
                            result = cacheManager.get(cur,
                                                      new Request(cur.action.fetch),
                                                      event,
                                                      matching);
                            return true; // stopping the loop
                        }
                    }
                });
            if (!result) {
                logger.info('No rules for failed request: ', pathName, '\nWill output the failure');
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
            return goFetch(null, request, event, matching);
        },
        
        createRedirect (request, event, matching) {
            return goFetch(null, request, event, matching);
        },
        
        respondItWith (event, response) {
            // respondWithThis
            event.respondWith(response);
            //DSWManager.tracking
        },
        
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
                
                DSW.requestId = 1 + (DSW.requestId || 0);
                
                // in case there are no rules (happens when chrome crashes, for example)
                if (!Object.keys(DSWManager.rules).length) {
                    return DSWManager.setup(PWASettings).then(_=>fetch(event));
                }
                
                const url = new URL(event.request.url);
                const pathName = url.pathname;
                
                // in case we want to enforce https
                if (PWASettings.enforceSSL) {
                    if (url.protocol != 'https:' && url.hostname != 'localhost') {
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
//                    clients.matchAll().then(result=>{
//                        debugger;
//                        result.forEach(cur=>{
//                            debugger;
//                            cur.postMessage('EVENTO RESPONDIDO!!');
//                        });
//                    });
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
    
    let comm = null;
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
        if (event.data === COMM_HAND_SHAKE) {
            logger.info('Commander Handshake enabled');
            comm = event.ports[0];
            setTimeout(_=>{
                comm.postMessage('thanks');
            }, 2000);
            //comm.postMessage('thanks');
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
        console.log(event, 'CHEGOU ALGO');
    });
    
    const comm = {
        setup(){
            if (comm.channel) {
                return navigator.serviceWorker.controller;
            }
                
            // during setup, we will stablish the communication between
            // service worker and client scopes
            var messageChannel = new MessageChannel();
            messageChannel.port1.onmessage = function(event) {
//                debugger;
//                if (event.data.error) {
//                    reject(event.data.error);
//                } else {
//                    resolve(event.data);
//                }
            };
            //navigator.serviceWorker.controller.postMessage(COMM_HAND_SHAKE, [comm.channel.port2]);
        }
    };
    
    DSW.track = function (matchingRequest) {
        var messageChannel = new MessageChannel();
        messageChannel.port1.onmessage = function(event) {
            debugger;
//                if (event.data.error) {
//                    reject(event.data.error);
//                } else {
//                    resolve(event.data);
//                }
        };
        navigator.serviceWorker
            .controller
            .postMessage({ trackPath: matchingRequest }, [messageChannel.port2]);
    };
    
    DSW.sendMessage = message=>{
        //if (comm.channel && comm.channel.port2 && navigator.serviceWorker) {
        //navigator.serviceWorker.controller.postMessage(message, [comm.channel.port2]);
        //}
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
            navigator.serviceWorker.ready.then(function(reg) {
                reg.pushManager.subscribe({
                    userVisibleOnly: true
                }).then(function(sub) {
                    logger.info('Subscribed to notification server:', sub.endpoint);
                    resolve(sub);
                }).catch(reason=>{
                    reject(reason || 'Not allowed by user');
                });
            });
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
                                        comm.setup();
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

                }
                navigator.serviceWorker.ready.then(function(reg) {
                    comm.setup();
                });
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
