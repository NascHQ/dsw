// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

import logger from './logger.js';
import getBestMatchingRX from './best-matching-rx.js';
import cacheManager from './cache-manager.js';
import goFetch from './go-fetch.js';
import strategies from './strategies.js';
import utils from './utils.js';

const DSW = { version: '#@!THE_DSW_VERSION_INFO!@#', build: '#@!THE_DSW_BUILD_TIMESTAMP!@#', ready: null };
const REQUEST_TIME_LIMIT = 5000;
const REGISTRATION_TIMEOUT = 12000;
const DEFAULT_NOTIF_DURATION = 6000;
const currentlyMocking = {};

// These will be used in both ServiceWorker and Client scopes
DSW.isOffline = DSW.offline = _=>{
    return !navigator.onLine;
};
DSW.isOnline = DSW.online = _=>{
    return navigator.onLine;
};

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
                            cur.action.fetch = cur.action.redirect;
                        }
                        if (cur.action.fetch) {
                            DSWManager.traceStep(event.request, 'Found fallback rule', {
                                rule: cur
                            }, false, event.request);
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
            }
            return result || response;
        },

        // SW Scope's setup
        setup (dswConfig={}) {
            // let's prepare both cacheManager and strategies with the
            // current referencies
            utils.setup(DSWManager, PWASettings, DSW);
            cacheManager.setup(DSWManager, PWASettings, goFetch);
            strategies.setup(DSWManager, cacheManager, goFetch);

            const ROOT_SW_SCOPE = (new URL(location.href)).pathname.replace(/\/[^\/]+$/, '/');

            return DSW.ready = new Promise((resolve, reject)=>{
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

                    if (!heuristic.match.length && !Object.keys(heuristic.match).length) {
                        // if there is nothing to match...we do nothing
                        return;
                    }
                    if (!Object.keys(heuristic.match).length) {
                        // if there is nothing to apply, we do nothing with it, either
                        return;
                    }

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
                        path = (heuristic.match.path || '' );
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
                    strategy: 'fastest',
                    match: { path: /^\/dsw.js(\?=dsw-manager)?$/ },
                    'apply': { cache: { } }
                }, location.href);

                // addinf the root path to be also cached by default
                let rootMatchingRX = /^(\/|\/index(\.[0-1a-z]+)?)$/;
                this.addRule('*', {
                    name: 'rootDir',
                    strategy: 'fastest',
                    match: { path: rootMatchingRX },
                    'apply': { cache: { } }
                }, rootMatchingRX);

                preCache.unshift(ROOT_SW_SCOPE);

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
                    ))
                    .then(_=>{
                        resolve();
                    })
                    .catch(err=>{
                        let errMessage = 'Failed storing the appShell! Could not register the service worker.' +
                                         '\nCould not find ' + (err.url || err.message) + '\n';
                        logger.error(errMessage,
                                     err);
                        reject(errMessage);
                    });
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
                        if (typeof result.clone != 'function') {
                            return resolve(result);
                        }
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
                                DSWManager.sendTraceData(event);
                            });
                        }
                        resolve(result);
                    });
                } else {
                    resolve(response);
                }
            }));
        },

        sendTraceData (event) {
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
                    event.request.originalSrc = movedInfo.url;
                    delete DSWManager.trackMoved[event.request.url];
                } else {
                    event.request.requestId = DSWManager.requestId;
                    DSWManager.traceStep(event.request, 'Arrived in Service Worker', {}, true);
                }

                const url = new URL(event.request.url);
                const sameOrigin = url.origin == location.origin;
                const pathName = url.pathname;

                if (event.request.method != 'GET') {
                    DSWManager.traceStep(event.request, `Ignoring ${event.request.method} request` , {});
                    DSWManager.sendTraceData(event);
                    return;
                }

                // in case there are no rules (happens when chrome crashes, for example)
                if (!Object.keys(DSWManager.rules).length) {
                    return DSWManager.setup(PWASettings).then(_=>fetch(event));
                }

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
                let matchingRule;
                if (!sameOrigin) {
                    matchingRule = getBestMatchingRX(url.origin + url.pathname,
                                                 DSWManager.rules['*']);
                } else {
                    matchingRule = getBestMatchingRX(pathName,
                                                 DSWManager.rules['*']);
                }
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
                } else {
                    // if it is not sameOrigin and there is no rule for it
                    if (!sameOrigin) {
                        DSWManager.traceStep(event.request, 'Ignoring request because it is not from same origin and there are no rules for it', {});
                        DSWManager.sendTraceData(event);
                        return;
                    }
                }

                // if no rule is applied, we will request it
                // this is the function to deal with the resolt of this request
                let defaultTreatment = function (response) {
                    if (response && (response.status == 200 || response.type == 'opaque' || response.type == 'opaqueredirect')) {
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

    let DSWStatus = false;
    self.addEventListener('activate', function(event) {
        event.waitUntil((_=>{
            let promises = [];
            if (PWASettings.applyImmediately) {
                promises.push(self.clients.claim());
            }
            promises.push(cacheManager.deleteUnusedCaches(PWASettings.keepUnusedCaches));
            return Promise.all(promises).then(_=>{
                DSWManager.broadcast({ DSWStatus });
            }).catch(err=>{
                DSWManager.broadcast({ DSWStatus });
            });
        })());
    });

    self.addEventListener('install', function(event) {
        // undoing some bad named properties :/
        PWASettings.dswRules = PWASettings.rules || PWASettings.dswRules || {};
        PWASettings.dswVersion = PWASettings.version || PWASettings.dswVersion || '1';

        if (PWASettings.applyImmediately) {
            return event.waitUntil(
                DSWManager.setup(PWASettings)
                .then(_=>{
                    DSWStatus = true;
                    self.skipWaiting();
                })
                .catch(_=>{
                    self.skipWaiting();
                })
            );
        }else{
            return event.waitUntil(DSWManager.setup(PWASettings));
        }
    });

    self.addEventListener('message', function(event) {
        const ports = event.ports;
        if (event.data.trackPath) {
            let tp = event.data.trackPath;
            DSWManager.tracking[tp] = {
                rx: new RegExp(tp, 'i'),
                ports: ports
            };
            return;
        }
        if (event.data.enableMocking) {
            let mockId = event.data.enableMocking.mockId;
            let matching = event.data.enableMocking.match;
            let finalMockId = mockId + matching;
            // we will mock only for some clients (this way you can have two tabs with different approaches)
            currentlyMocking[event.source.id] = currentlyMocking[event.source.id] || {};
            let client = currentlyMocking[event.source.id];
            // this client will mock the rules in mockId
            client[finalMockId] = client[finalMockId] || [];
            currentlyMocking[finalMockId].push();
            debugger;
            return;
        }
    });

    self.addEventListener('push', function(event) {

        // let's trigger the event
        DSWManager.broadcast({
            event: 'pushnotification',
            data: event.data
        });

        if (PWASettings.notification && PWASettings.notification.dataSrc) {
            // if there is a dataSrc defined, we fetch it
            return event.waitUntil(fetch(PWASettings.notification.dataSrc).then(response=>{
                if (response.status == 200) {
                    // then to use it as the structure for the notification
                    return response.json().then(data=>{
                        let notifData = {};
                        if (PWASettings.notification.dataPath) {
                            notifData = data[PWASettings.notification.dataPath];
                        } else {
                            notifData = data;
                        }
                        let notif = self.registration.showNotification(notifData.title, {
                            'body': notifData.body || notifData.content || notifData.message,
                            'icon': notifData.icon || notifData.image,
                            'tag': notifData.tag || null
                        });
                    });
                } else {
                    throw new Error(`Fetching ${PWASettings.notification.dataSrc} returned a ${response.status} status.`);
                }
            }).catch(err=>{
                logger.warn('Received a push, but Failed retrieving the notification data.', err);
            }));
        } else if (PWASettings.notification.title) {
            // you can also specify the message data
            let n = PWASettings.notification;
            let notif = self.registration.showNotification(
                n.title,
                {
                    'body': n.body || n.content || n.message,
                    'icon': n.icon || n.image,
                    'tag': n.tag || null
                });
        }
    });

    // When user clicks/touches the notification, we shall close it and open
    // or focus the web page
    self.addEventListener('notificationclick', function(event) {
        let tag = event.notification.tag,
            targetUrl,
            eventData = {
                tag,
                title: event.notification.title,
                body: event.notification.body,
                icon: event.notification.icon,
                badge: event.notification.badge,
                lang: event.notification.lang,
                timestamp: event.notification.timestamp
            };

        event.notification.close();

        // the targetUul is the used to know if DSW should open a new window,
        // focus a window or simply trigger the event
        if (PWASettings.notification && PWASettings.notification.target !== void(0)) {
            targetUrl = PWASettings.notification.target;
        } else {
            targetUrl = location.toString();
        }

        event.waitUntil(
            // let's look for all windows(or frames) that are using our sw
            clients.matchAll({
                type: 'window'
            }).then(function(windowClients) {
                let p;
                // and let's see if any of these is already our page
                for (let i = 0; i < windowClients.length; i++) {
                    let client = windowClients[i];
                    // if it is, we simply focus it
                    if ((client.url == targetUrl ||
                        (new URL(client.url)).pathname == targetUrl) &&
                        'focus' in client) {
                        p= client.focus();
                        break;
                    }
                }
                // if it is not opened, we open it
                if (!p && targetUrl && clients.openWindow) {
                    p= clients.openWindow(targetUrl);
                } else {
                    // if not, we simply resolve it
                    p = Promise.resolve();
                }

                // now we execute the promise (either a openWindow or focus)
                p.then(_=>{
                    // and then trigger the event
                    DSWManager.broadcast({
                        event: 'notificationclicked',
                        data: eventData,
                    });
                });
            })
        );
    });


    self.addEventListener('sync', function(event) {
        // TODO: add support to sync event as browsers evolve and support the feature
        //debugger;
    });

    DSWManager.startListening();

}else{

    DSW.status = {
        version: PWASettings.version || PWASettings.dswVersion,
        registered: false,
        sync: false,
        appShell: false,
        notification: false
    };

    let pendingResolve,
        pendingReject,
        registeredServiceWorker,
        installationTimeOut;

    const eventManager = (()=>{
        const events = {};
        return {
            addEventListener (eventName, listener) {
                events[eventName] = events[eventName] || [];
                events[eventName].push(listener);
            },
            trigger (eventName, data={}) {
                let listener;
                try {
                    if (events[eventName]) {
                        for (listener of events[eventName]) {
                            if (typeof listener == 'function') {
                                listener(data);
                            }
                        }
                    }

                    listener = 'on' + eventName;
                    if (typeof DSW[listener] == 'function') {
                        DSW[listener](data);
                    }
                }catch(e){
                    if (listener && listener.name) {
                        listener = listener.name;
                    } else {
                        listener = listener || 'annonymous';
                    }
                    logger.error(`Failed trigerring event ${eventName} on listener ${listener}` , e.message, e);
                }
            }
        };
    })();

    // let's store some events, so it can be autocompleted in devTools
    DSW.addEventListener = eventManager.addEventListener;
    DSW.onpushnotification = function () { /* use this to know when a notification arrived */ };
    DSW.onnotificationclicked = function () { /* use this to know when the user has clicked in a notification */ };
    DSW.onenabled = function () { /* use this to know when DSW is enabled and running */ };
    DSW.onregistered = function () { /* use this to know when DSW has been registered */ };
    DSW.onregistered = function () { /* use this to know when DSW has been registered */ };
    DSW.onnotificationsenabled = function () { /* use this to know when user has enabled notifications */ };

    navigator.serviceWorker.addEventListener('message', event=>{
        // if it is waiting for the installation confirmation
        if (pendingResolve && event.data.DSWStatus !== void(0)) {
            // and if the message is about a successful installation
            if (registeredServiceWorker) {
                // this means all the appShell have been downloaded
                if (event.data.DSWStatus) {
                    DSW.status.appShell = true;
                    eventManager.trigger('activated', DSW.status);
                    pendingResolve(DSW.status);
                } else {
                    // if it failed, let's unregister it, to avoid false positives
                    DSW.status.appShell = false;
                    pendingReject(DSW.status);
                    registeredServiceWorker.unregister();
                }
            }
            pendingResolve = false;
            pendingReject = false;
        }

        eventManager.trigger(event.data.event, event.data.data); // yeah, I know ¬¬
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

    DSW.enableMocking = function (mockId, match='.*') {
        var messageChannel = new MessageChannel();
        navigator.serviceWorker
            .controller
            .postMessage({ enableMocking: { mockId, match } }, [messageChannel.port2]);
    };
    DSW.disableMocking = function (mockId, match='.*') {
        var messageChannel = new MessageChannel();
        navigator.serviceWorker
            .controller
            .postMessage({ disableMocking: { mockId, match } }, [messageChannel.port2]);
    };

    DSW.sendMessage = (message, waitForAnswer=false)=>{
        // This method sends a message to the service worker.
        // Useful for specific tokens and internal use and trace
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

    // this means all the appShell dependencies have been downloaded and
    // the sw has been successfuly installed and registered
    DSW.isAppShellDone = DSW.isActivated = _=>{
        return DSW.status.registered && DSW.status.appShell;
    };
    DSW.isRegistered = _=>{
        return DSW.status.registered;
    };

    // this method will register the SW for push notifications
    // but is not really connected to web notifications (the popup message)
    DSW.enableNotifications = _=>{
        return new Promise((resolve, reject)=>{
            if (navigator.onLine) {
                navigator.serviceWorker.ready.then(function(reg) {
                    let req = reg.pushManager.subscribe({
                        userVisibleOnly: true
                    });
                    return req.then(function(sub) {
                        DSW.status.notification = sub.endpoint;
                        eventManager.trigger('notificationsenabled', DSW.status);
                        logger.info('Registered to notification server');
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
                    icon: options.icon || false,
                    tag: options.tag || null
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

    // client's setup
    DSW.setup = (config={}) => {

        // in case DSW.setup has already been called
        if (DSW.ready) {
            return DSW.ready;
        }

        return DSW.ready = new Promise((resolve, reject)=>{
            let appShellPromise = new Promise((resolve, reject)=>{
                pendingResolve = function(){
                    clearTimeout(installationTimeOut);
                    resolve(DSW.status);
                };
            });
            pendingReject = function(reason){
                clearTimeout(installationTimeOut);
                reject(reason || 'Installation timeout');
            };

            // opening on a page scope...let's install the worker
            if(navigator.serviceWorker){
                if (!navigator.serviceWorker.controller) {
                    // rejects the registration after some time, if not resolved by then
                    installationTimeOut = setTimeout(reject, config.timeout || REGISTRATION_TIMEOUT);

                    // we will use the same script, already loaded, for our service worker
                    var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
                    navigator.serviceWorker
                        .register(src)
                        .then(SW=>{
                            registeredServiceWorker = SW;
                            DSW.status.registered = true;

                            navigator.serviceWorker.ready.then(function(reg) {

                                DSW.status.ready = true;
                                eventManager.trigger('registered', DSW.status);

                                Promise.all([
                                    appShellPromise,
                                    new Promise((resolve, reject)=>{
                                        if (PWASettings.notification && PWASettings.notification.auto) {
                                            return DSW.enableNotifications();
                                        } else {
                                            resolve();
                                        }
                                    }),
                                    new Promise((resolve, reject)=>{
                                        // setting up sync
                                        if (config && config.sync) {
                                            if ('SyncManager' in window) {
                                                navigator.serviceWorker.ready.then(function(reg) {
                                                    return reg.sync.register('syncr');
                                                })
                                                .then(_=>{
                                                    DSW.status.sync = true;
                                                    resolve();
                                                });
                                            } else {
                                                DSW.status.sync= 'Failed enabling sync';
                                                resolve();
                                            }
                                        } else {
                                            resolve();
                                        }
                                    })
                                ]).then(_=>{
                                    localStorage.setItem('DSW-STATUS', JSON.stringify(DSW.status));
                                    eventManager.trigger('enabled', DSW.status);
                                    logger.info('Service Worker was registered', DSW.status);
                                    resolve(DSW.status);
                                });
                            });
                        })
                        .catch(err=>{
                            reject({
                                status: false,
                                sync: false,
                                sw: false,
                                message: 'Failed registering service worker with the message:\n ' + (err.message),
                                error: err
                            });
                        });
                } else { // TODO: remove it from the else statement and see if it works even for the first load
                    // service worker was already registered and is active
                    // setting up traceable requests
                    if (config && config.trace) {
                        navigator.serviceWorker.ready.then(function(reg) {
                            let match;
                            for(match in config.trace){
                                DSW.trace(match, config.trace[match]);
                            }
                        });
                    }
                    // on refreshes, we update the variable to be used in the API
                    DSW.status = JSON.parse(localStorage.getItem('DSW-STATUS'));
                }
            } else {
                DSW.status.fail = 'Service worker not supported';
            }
        });
    };

    if (typeof window !== 'undefined') {
        window.DSW = DSW;
    }
}

export default DSW;
