(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
function getBestMatchingRX(str, expressions) {
    var bestMatchingRX = void 0;
    var bestMatchingGroupSize = Number.MAX_SAFE_INTEGER;
    var bestMatchingGroup = void 0;

    expressions.forEach(function (currentRX) {
        var regex = new RegExp(currentRX.rx);
        var groups = str.match(regex);
        if (groups && groups.length < bestMatchingGroupSize) {
            bestMatchingRX = currentRX;
            bestMatchingGroupSize = groups.length;
            bestMatchingGroup = groups;
        }
    });

    return bestMatchingRX ? {
        rule: bestMatchingRX,
        matching: bestMatchingGroup
    } : false;
}

exports.default = getBestMatchingRX;

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _indexeddbManager = require('./indexeddb-manager.js');

var _indexeddbManager2 = _interopRequireDefault(_indexeddbManager);

var _utils = require('./utils.js');

var _utils2 = _interopRequireDefault(_utils);

var _logger = require('./logger.js');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var DEFAULT_CACHE_NAME = 'defaultDSWCached';
var CACHE_CREATED_DBNAME = 'cacheCreatedTime';
var DEFAULT_CACHE_VERSION = null;

var DSWManager = void 0,
    PWASettings = void 0,
    goFetch = void 0;

// finds the real size of an utf-8 string
function lengthInUtf8Bytes(str) {
    // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
    var m = encodeURIComponent(str).match(/%[89ABab]/g);
    return str.length + (m ? m.length : 0);
}

var parseExpiration = function parseExpiration(rule, expires) {
    var duration = expires || -1;

    if (typeof duration == 'string') {
        // let's use a formated string to know the expiration time
        var sizes = {
            s: 1,
            m: 60,
            h: 3600,
            d: 86400,
            w: 604800,
            M: 2592000,
            Y: 31449600
        };

        var size = duration.slice(-1),
            val = duration.slice(0, -1);
        if (sizes[size]) {
            duration = val * sizes[size];
        } else {
            _logger2.default.warn('Invalid duration ' + duration, rule);
            duration = -1;
        }
    }
    if (duration >= 0) {
        return parseInt(duration, 10) * 1000;
    } else {
        return 0;
    }
};

var cacheManager = {
    setup: function setup(DSWMan, PWASet, ftch) {
        PWASettings = PWASet;
        DSWManager = DSWMan;
        goFetch = ftch;
        DEFAULT_CACHE_VERSION = PWASettings.dswVersion || '1';
        _indexeddbManager2.default.setup(cacheManager);
        // we will also create an IndexedDB to store the cache creationDates
        // for rules that have cash expiration
        _indexeddbManager2.default.create({
            version: 1,
            name: CACHE_CREATED_DBNAME,
            key: 'url'
        });
    },
    registeredCaches: [],
    createDB: function createDB(db) {
        return _indexeddbManager2.default.create(db);
    },
    // Delete all the unused caches for the new version of the Service Worker
    deleteUnusedCaches: function deleteUnusedCaches(keepUnused) {
        if (!keepUnused) {
            return caches.keys().then(function (keys) {
                cacheManager.registeredCaches;
                return Promise.all(keys.map(function (key) {
                    if (cacheManager.registeredCaches.indexOf(key) < 0) {
                        return caches.delete(key);
                    }
                }));
            });
        }
    },
    // this method will delete all the caches
    clear: function clear(_) {
        if ('window' in self) {
            // if we are not in the ServiceWorkerScope, we message it
            // to clear all the cache
            return window.DSW.sendMessage({
                clearEverythingUp: true
            }, true);
        } else {
            // we are in the ServiceWorkerScope, and should delete everything
            return caches.keys().then(function (keys) {
                var cleanItUp = keys.map(function (key) {
                    return caches.delete(key);
                });
                // we will also drop the databases from IndexedDB
                cleanItUp.push(_indexeddbManager2.default.clear());
                return Promise.all(cleanItUp);
            });
        }
    },
    // return a name for a default rule or the name for cache using the version
    // and a separator
    mountCacheId: function mountCacheId(rule) {
        if (typeof rule == 'string') {
            return rule;
        }
        var cacheConf = rule ? rule.action.cache : false;
        if (cacheConf) {
            return (cacheConf.name || DEFAULT_CACHE_NAME) + '::' + (cacheConf.version || DEFAULT_CACHE_VERSION);
        }
        return DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION;
    },
    register: function register(rule) {
        cacheManager.registeredCaches.push(cacheManager.mountCacheId(rule));
    },
    // just a different method signature, for .add
    put: function put(rule, request, response) {
        return cacheManager.add(request, typeof rule == 'string' ? rule : cacheManager.mountCacheId(rule), response, rule);
    },
    add: function add(request, cacheId, response, rule) {
        cacheId = cacheId || cacheManager.mountCacheId(rule);
        return new Promise(function (resolve, reject) {
            function addIt(response) {
                if (response.status == 200 || response.type == 'opaque') {
                    caches.open(cacheId).then(function (cache) {
                        // adding to cache
                        var opts = response.type == 'opaque' ? { mode: 'no-cors' } : {};
                        request = _utils2.default.createRequest(request, opts);

                        if (request.method != 'POST') {
                            (function () {
                                var cacheData = {};
                                if (rule && rule.action && rule.action.cache) {
                                    cacheData = rule.action.cache;
                                } else {
                                    cacheData = {
                                        name: cacheId,
                                        version: cacheId.split('::')[1]
                                    };
                                }

                                var clonedResponse = void 0;
                                if (response.bodyUsed) {
                                    // sometimes, due to different flows, the
                                    // request body may have been already used
                                    // In this case, we use cache.add instead
                                    // of cache.put
                                    cache.add(request).then(function (cached) {
                                        DSWManager.traceStep(request, 'Added to cache', { cacheData: cacheData });
                                    }).catch(function (err) {
                                        _logger2.default.error('Could not save into cache', err);
                                    });
                                } else {
                                    clonedResponse = response.clone();
                                    DSWManager.traceStep(request, 'Added to cache', { cacheData: cacheData });
                                    clonedResponse & request & cache.put(request, clonedResponse);
                                }
                            })();
                        }
                        resolve(response);
                        // in case it is supposed to expire
                        if (rule && rule.action && rule.action.cache && rule.action.cache.expires) {
                            // saves the current time for further validation
                            cacheManager.setExpiringTime(request, rule || cacheId, rule.action.cache.expires);
                        }
                    }).catch(function (err) {
                        _logger2.default.error('Could not save into cache', err);
                        resolve(response);
                    });
                } else {
                    reject(response);
                }
            }

            if (!response) {
                fetch(goFetch(null, request)).then(addIt).catch(function (err) {
                    DSWManager.traceStep(request, 'Fetch failed');
                    _logger2.default.error('[ DSW ] :: Failed fetching ' + (request.url || request), err);
                    reject(response);
                });
            } else {
                addIt(response);
            }
        });
    },
    setExpiringTime: function setExpiringTime(request, rule) {
        var expiresAt = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;

        if (typeof expiresAt == 'string') {
            expiresAt = parseExpiration(rule, expiresAt);
        }
        _indexeddbManager2.default.addOrUpdate({
            url: request.url || request,
            dateAdded: new Date().getTime(),
            expiresAt: expiresAt
        }, CACHE_CREATED_DBNAME);
    },
    hasExpired: function hasExpired(request) {
        return new Promise(function (resolve, reject) {
            _indexeddbManager2.default.find(CACHE_CREATED_DBNAME, 'url', request.url || request).then(function (r) {
                if (r && new Date().getTime() > r.dateAdded + r.expiresAt) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            }).catch(function (_) {
                resolve(false);
            });
        });
    },
    get: function get(rule, request, event, matching, forceFromCache) {
        var treatFailure = arguments.length > 5 && arguments[5] !== undefined ? arguments[5] : true;

        var actionType = Object.keys(rule.action)[0],
            url = request.url || request,
            pathName = new URL(url).pathname;

        // requests to / should be cached by default
        if (rule.action.cache !== false && (pathName == '/' || pathName.match(/^\/index\.([a-z0-9]+)/i))) {
            rule.action.cache = rule.action.cache || {};
        }

        var opts = rule.options || {};
        opts.headers = opts.headers || new Headers();

        actionType = actionType.toLowerCase();
        // let's allow an idb alias for indexeddb...maybe we could move it to a
        // separated structure
        actionType = actionType == 'idb' ? 'indexeddb' : actionType;

        // cache may expire...if so, we will use this verification afterwards
        var verifyCache = void 0,
            urlToMatch = null;
        if (rule.action.cache && rule.action.cache.expires) {
            verifyCache = cacheManager.hasExpired(request);
        } else {
            // if it will not expire, we just use it as a resolved promise
            verifyCache = Promise.resolve();
        }

        switch (actionType) {
            case 'bypass':
                {
                    // if it is a bypass action (no rule shall be applied, at all)
                    if (rule.action[actionType] == 'request') {
                        // it may be of type request
                        // and we will simple allow it to go ahead
                        // this also means we will NOT treat any result from it
                        //logger.info('Bypassing request, going for the network for', request.url);

                        var treatResponse = function treatResponse(response) {
                            if (response.status >= 200 && response.status < 300) {
                                DSWManager.traceStep(event.request, 'Request bypassed');
                                return response;
                            } else {
                                DSWManager.traceStep(event.request, 'Bypassed request failed and was ignored');
                                var resp = new Response(''); // ignored
                                return resp;
                            }
                        };
                        // here we will use a "raw" fetch, instead of goFetch, which would
                        // create a new Request and define propreties to it
                        return fetch(goFetch(null, event.request)).then(treatResponse).catch(treatResponse);
                    } else {
                        // or of type 'ignore' (or anything else, actually)
                        // and we will simply output nothing, as if ignoring both the
                        // request and response
                        DSWManager.traceStep(event.request, 'Bypassed request');
                        actionType = 'output';
                        rule.action[actionType] = '';
                    }
                }
            case 'output':
                {
                    DSWManager.traceStep(event.request, 'Responding with string output', { output: (rule.action[actionType] + '').substring(0, 180) });
                    return new Response(_utils2.default.applyMatch(matching, rule.action[actionType]));
                }
            case 'indexeddb':
                {
                    return new Promise(function (resolve, reject) {
                        // function to be used after fetching
                        function treatFetch(response) {
                            if (response && response.status == 200) {
                                // with success or not(saving it), we resolve it
                                var done = function done(err) {
                                    if (err) {
                                        DSWManager.traceStep(event.request, 'Could not save response into IndexedDB', { err: err });
                                    } else {
                                        DSWManager.traceStep(event.request, 'Response object saved into IndexedDB');
                                    }
                                    resolve(response);
                                };
                                // store it in the indexedDB
                                _indexeddbManager2.default.save(rule.name, response.clone(), request, rule).then(done).catch(done); // if failed saving, we still have the reponse to deliver
                            } else {
                                // if it failed, we can look for a fallback
                                url = request.url;
                                pathName = new URL(url).pathname;
                                DSWManager.traceStep(event.request, 'Fetch failed', {
                                    url: request.url,
                                    status: response.status,
                                    statusText: response.statusText
                                });
                                return DSWManager.treatBadPage(response, pathName, event);
                            }
                        }

                        // let's look for it in our cache, and then in the database
                        // (we use the cache, just so we can user)
                        _indexeddbManager2.default.get(rule.name, request).then(function (result) {
                            // if we did have it in the indexedDB
                            if (result) {
                                // we use it
                                DSWManager.traceStep(event.request, 'Found stored in IndexedDB');
                                return treatFetch(result);
                            } else {
                                // if it was not stored, let's fetch it
                                DSWManager.traceStep(event.request, 'Will fetch', {
                                    url: request.url,
                                    method: request.method
                                });
                                return goFetch(rule, request, event, matching).then(treatFetch).catch(treatFetch);
                            }
                        });
                    });
                }
            case 'redirect':
            case 'fetch':
                {
                    request = DSWManager.createRedirect(rule.action.fetch || rule.action.redirect, event, matching);
                    url = request.url;
                    pathName = new URL(url).pathname;
                    // keep going to be treated with the cache case
                }
            case 'cache':
                {
                    var cacheId = void 0;

                    if (event.request.cachedFrom) {
                        // rule.action.cache  && rule.action.cache.from) {
                        urlToMatch = event.request.cachedFrom;
                    } else {
                        urlToMatch = null;
                    }

                    if (rule.action.cache) {
                        cacheId = cacheManager.mountCacheId(rule);
                    }

                    // lets verify if the cache is expired or not
                    return verifyCache.then(function (expired) {
                        var lookForCache = void 0;
                        if (expired && !forceFromCache) {
                            // in case it has expired, it resolves automatically
                            // with no results from cache
                            DSWManager.traceStep(event.request, 'Cache was expired');
                            lookForCache = Promise.resolve();
                        } else {
                            // if not expired, let's look for it!
                            lookForCache = caches.match(urlToMatch || request);
                        }

                        // look for the request in the cache
                        return lookForCache.then(function (result) {
                            // if it does not exist (cache could not be verified)
                            if (result && result.status != 200) {
                                DSWManager.traceStep(event.request, 'Not found in cache', {
                                    url: request.url,
                                    status: result.status,
                                    statusText: result.statusText
                                });
                                // if it has expired in cache, failed requests for
                                // updates should return the previously cached data
                                // even if it has expired
                                if (expired) {
                                    DSWManager.traceStep(event.request, 'Forcing ' + (expired ? 'expired ' : '') + 'from cache');
                                    // the true argument flag means it should come from cache, anyways
                                    return cacheManager.get(rule, request, event, matching, true);
                                }
                                if (treatFailure) {
                                    // look for rules that match for the request and its status
                                    (DSWManager.rules[result.status] || []).some(function (cur, idx) {
                                        if (pathName.match(cur.rx)) {
                                            // if a rule matched for the status and request
                                            // and it tries to fetch a different source
                                            if (cur.action.fetch || cur.action.redirect) {
                                                DSWManager.traceStep(event.request, 'Found fallback for failure', {
                                                    rule: cur,
                                                    url: request.url
                                                });
                                                // problematic requests should
                                                result = goFetch(rule, request, event, matching);
                                                return true; // stopping the loop
                                            }
                                        }
                                    });
                                }
                                // we, then, return the promise of the failed result(for it
                                // could not be loaded and was not in cache)
                                return result;
                            } else {
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
                                        DSWManager.traceStep(event.request, 'Result found in cache', {
                                            url: event.request.url,
                                            cacheSource: event.request.cachedFrom || event.request.url
                                        });
                                        // it was successful
                                        return result;
                                    } else {
                                        // it is a redirect (different urls)
                                        DSWManager.traceStep(event.request, 'Redirecting', {
                                            from: event.request.url,
                                            to: request.url
                                        }, false, { // telling the tracker that it has moved
                                            url: request.url,
                                            id: request.requestId,
                                            steps: request.traceSteps,
                                            rule: rule
                                        });
                                        // let's move the browser's url and return
                                        // the appropriate header
                                        return Response.redirect(request.url, 302);
                                    }
                                } else if (actionType == 'redirect') {
                                    // if this is supposed to redirect
                                    DSWManager.traceStep(event.request, 'Must redirect', {
                                        from: event.request.url,
                                        to: request.url
                                    }, false, { // telling the tracker that it has moved
                                        url: request.url,
                                        id: request.requestId,
                                        steps: request.traceSteps,
                                        rule: rule
                                    });
                                    return Response.redirect(request.url, 302);
                                } else {
                                    // this is a "normal" request, let's deliver it
                                    // but we will be using a new Request with some info
                                    // to allow browsers to understand redirects in case
                                    // it must be redirected later on
                                    var treatFetch = function treatFetch(response) {
                                        if (response.type == 'opaque') {
                                            // if it is a opaque response, let it go!
                                            if (rule.action.cache !== false) {
                                                DSWManager.traceStep(event.request, 'Added to cache (opaque)', {
                                                    url: request.url
                                                });
                                                return cacheManager.add(_utils2.default.createRequest(request, { mode: request.mode || 'no-cors' }), cacheManager.mountCacheId(rule), response, rule);
                                            }
                                            return response;
                                        }

                                        if (!response.status) {
                                            response.status = 404;
                                        }
                                        // after retrieving it, we cache it
                                        // if it was ok
                                        if (response.status == 200) {
                                            DSWManager.traceStep(event.request, 'Received result OK (200)', {
                                                url: request.url
                                            });
                                            // if cache is not false, it will be added to cache
                                            if (rule.action.cache !== false) {
                                                // let's save it into cache
                                                DSWManager.traceStep(event.request, 'Saving into cache', {
                                                    url: request.url
                                                });
                                                return cacheManager.add(request, cacheManager.mountCacheId(rule), response, rule);
                                            } else {
                                                return response;
                                            }
                                        } else {
                                            // if it had expired, but could not be retrieved
                                            // from network, let's give its cache a chance!
                                            DSWManager.traceStep(request, 'Failed fetching', {
                                                url: request.url
                                            });
                                            if (expired) {
                                                _logger2.default.warn('Cache for ', request.url || request, 'had expired, but the updated version could not be retrieved from the network!\n', 'Delivering the outdated cached data');
                                                DSWManager.traceStep(event.request, 'Using expired cache', { note: 'Failed fetching, loading from cache even though it was expired' });
                                                return cacheManager.get(rule, request, event, matching, true);
                                            }
                                            // otherwise...let's see if there is a fallback
                                            // for the 404 requisition
                                            return DSWManager.treatBadPage(response, pathName, event);
                                        }
                                    };

                                    // if not in cache, let's see if we should look
                                    // for it in the network
                                    if (treatFailure) {
                                        DSWManager.traceStep(event.request, 'Will fetch', {
                                            url: request.url,
                                            method: request.method
                                        });
                                        return goFetch(rule, request, event, matching).then(treatFetch).catch(treatFetch);
                                    }
                                }
                            }
                        }); // end lookForCache
                    }); // end verifyCache
                }
            default:
                {
                    // also used in fetch actions
                    return event;
                }
        }
    }
};

exports.default = cacheManager;

},{"./indexeddb-manager.js":4,"./logger.js":5,"./utils.js":8}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _utils = require('./utils.js');

var _utils2 = _interopRequireDefault(_utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var origin = location.origin;

function goFetch(rule, request, event, matching) {
    var tmpUrl = rule ? rule.action.fetch || rule.action.redirect : '';
    if (typeof request == 'string') {
        request = location.origin + request;
    }
    if (!tmpUrl) {
        tmpUrl = request.url || request;
    }
    var originalUrl = tmpUrl;
    var sameOrigin = new URL(tmpUrl).origin == origin;

    // if there are group variables in the matching expression
    tmpUrl = _utils2.default.applyMatch(matching, tmpUrl);

    // if no rule is passed
    if (request && !rule) {
        // we will just create a simple request to be used "anywhere"
        var mode = request.mode;
        if (!mode || mode == 'navigate') {
            mode = sameOrigin ? 'cors' : 'no-cors';
        }

        var req = new Request(tmpUrl, {
            method: request.method || 'GET',
            headers: request.headers || {},
            mode: mode,
            cache: 'default',
            redirect: 'manual'
        });

        if (request.body) {
            req.body = request.body;
        }

        req.requestId = (event ? event.request : request).requestId;
        req.traceSteps = (event ? event.request : request).traceSteps;

        return req;
    }

    var actionType = Object.keys(rule.action)[0];
    var opts = rule.options || {};
    opts.headers = opts.headers || new Headers();

    // if the cache options is false, we force it not to be cached
    if (rule.action.cache === false) {
        opts.headers.append('pragma', 'no-cache');
        opts.headers.append('cache-control', 'no-store,no-cache');
        tmpUrl = tmpUrl + (tmpUrl.indexOf('?') > 0 ? '&' : '?') + new Date().getTime();
    }

    // we will create a new request to be used, based on what has been
    // defined by the rule or current request
    var reqConfig = {
        method: opts.method || request.method,
        headers: opts || request.headers,
        mode: actionType == 'redirect' ? request.mode || 'same-origin' : 'cors',
        redirect: actionType == 'redirect' ? 'manual' : request.redirect
    };

    //    if (request.credentials && request.credentials != 'omit') {
    //        reqConfig.credentials = request.credentials;
    //    }

    // if the host is not the same
    if (!sameOrigin) {
        // we set it to an opaque request
        reqConfig.mode = request.mode || 'no-cors';
    }
    request = new Request(tmpUrl || request.url, reqConfig);

    request.requestId = (event ? event.request : request).requestId;
    request.traceSteps = (event ? event.request : request).traceSteps;

    if (actionType == 'redirect') {
        // if this is supposed to redirect
        return Response.redirect(request.url, 302);
    } else {
        // if this is a "normal" request, let's deliver it
        // but we will be using a new Request with some info
        // to allow browsers to understand redirects in case
        // it must be redirected later on
        return fetch(request, opts);
    }
}

exports.default = goFetch;

},{"./utils.js":8}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _logger = require('./logger.js');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var DEFAULT_DB_NAME = 'defaultDSWDB';
var INDEXEDDB_REQ_IDS = 'indexeddb-id-request';
var dbs = {};
var cacheManager;

function getObjectStore(dbName) {
    var mode = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'readwrite';

    var db = dbs[dbName],
        tx = void 0;
    if (db) {
        tx = db.transaction(dbName, mode);
        return tx.objectStore(dbName);
    }
    return false;
}

var indexedDBManager = {
    setup: function setup(cm) {
        cacheManager = cm;
    },
    clear: function clear() {
        var dbList = [];

        var _loop = function _loop(db) {
            dbList.push(new Promise(function (resolve, reject) {
                var req = indexedDB.deleteDatabase(db);
                req.onsuccess = function () {
                    resolve();
                };
                req.onerror = function (err) {
                    reject();
                    _logger2.default.error('Could not drop indexedDB database\n', err || this.error);
                };
                req.onblocked = function (err) {
                    reject();
                    _logger2.default.error('Could not drop indexedDB database, it was locked\n', err || this.error);
                };
            }));
        };

        for (var db in dbs) {
            _loop(db);
        }
        return Promise.all([].concat(dbList));
    },
    create: function create(config) {
        return new Promise(function (resolve, reject) {

            var request = indexedDB.open(config.name || DEFAULT_DB_NAME, parseInt(config.version, 10) || undefined);

            function dataBaseReady(db, dbName, resolve) {
                db.onversionchange = function (event) {
                    db.close();
                    //logger.log('There is a new version of the database(IndexedDB) for ' + dbName);
                };

                if (!dbs[dbName]) {
                    dbs[dbName] = db;
                }

                resolve(config);
            }

            request.onerror = function (event) {
                reject('Could not open the database (indexedDB) for ' + config.name);
            };

            request.onupgradeneeded = function (event) {
                var db = event.target.result;
                var baseData = {};

                if (config.key) {
                    baseData.keyPath = config.key;
                }
                if (!config.key || config.autoIncrement) {
                    baseData.autoIncrement = true;
                }
                if (config.version) {
                    baseData.version = config.version;
                } else {
                    baseData.version = 1;
                }

                if (event.oldVersion && event.oldVersion < baseData.version) {
                    // in case there already is a store with that name
                    // with a previous version
                    db.deleteObjectStore(config.name);
                } else if (event.oldVersion === 0) {
                    (function () {
                        // if it is the first time it is creating it
                        var objectStore = db.createObjectStore(config.name, baseData);
                        // in case there are indexes defined, we create them
                        if (config.indexes) {
                            config.indexes.forEach(function (index) {
                                if (typeof index == 'string') {
                                    objectStore.createIndex(index, index, {});
                                } else {
                                    objectStore.createIndex(index.name, index.path || index.name, index.options);
                                }
                            });
                        }
                        // we will also make the key, an index
                        objectStore.createIndex(config.key, config.key, { unique: true });
                    })();
                }

                dataBaseReady(db, config.name, resolve);
            };

            request.onsuccess = function (event) {
                var db = event.target.result;
                dataBaseReady(db, config.name, resolve);
            };
        });
    },
    get: function get(dbName, request) {
        return new Promise(function (resolve, reject) {
            // We will actuallly look for its IDs in cache, to use them to find
            // the real, complete object in the indexedDB
            caches.match(request).then(function (result) {
                if (result) {
                    result.json().then(function (obj) {
                        // if the request was in cache, we now have got
                        // the id=value for the indexes(keys) to look for,
                        // in the indexedDB!
                        var store = getObjectStore(dbName),
                            index = store ? store.index(obj.key) : false,
                            getter = index ? index.get(obj.value) : false;
                        // in case we did get the content from indexedDB
                        // let's create a new Response out of it!
                        if (getter) {
                            getter.onsuccess = function (event) {
                                resolve(new Response(JSON.stringify(event.target.result), {
                                    headers: { 'Content-Type': 'application/json' }
                                }));
                            };
                            getter.onerror = function (event) {
                                // if we did not find it (or faced a problem) in
                                // indexeddb, we leave it to the network
                                resolve();
                            };
                        } else {
                            // in case it failed for some reason
                            // we leave it and allow it to be requested
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        });
    },


    find: function find(dbName, key, value) {
        return new Promise(function (resolve, reject) {
            var store = getObjectStore(dbName);

            if (store) {
                var index = store.index(key),
                    getter = index.get(value);

                getter.onsuccess = function (event) {
                    resolve(event.target.result);
                };
                getter.onerror = function (event) {
                    reject();
                };
            } else {
                resolve();
            }
        });
    },

    addOrUpdate: function addOrUpdate(obj, dbName) {
        return new Promise(function (resolve, reject) {
            var store = getObjectStore(dbName);
            if (store) {
                var req = store.put(obj);
                req.onsuccess = function addOrUpdateSuccess() {
                    resolve(obj);
                };
                req.onerror = function addOrUpdateError(err) {
                    resolve(obj);
                };
            } else {
                resolve({});
            }
        });
    },
    save: function save(dbName, data, request, rule) {
        var _this = this;

        return new Promise(function (resolve, reject) {

            data.json().then(function (obj) {

                var store = getObjectStore(dbName),
                    req = void 0;

                if (store) {
                    req = store.put(obj);

                    // We will use the CacheAPI to store, in cache, only the IDs for
                    // the given object
                    req.onsuccess = function () {
                        var tmp = {};
                        var key = rule.action.indexedDB.key || 'id';
                        tmp.key = key;
                        tmp.value = obj[key];

                        cacheManager.put(INDEXEDDB_REQ_IDS, request, new Response(JSON.stringify(tmp), {
                            headers: { 'Content-Type': 'application/json' }
                        }));
                        resolve();
                    };
                    req.onerror = function (event) {
                        reject('Failed saving to the indexedDB!\n' + this.error);
                    };
                } else {
                    reject('Failed saving into indexedDB...\n' + _this.error);
                }
            }).catch(function (err) {
                _logger2.default.error('Failed saving into indexedDB!\n', err.message || _this.error, err);
                reject('Failed saving into indexedDB:\n' + _this.error);
            });
        });
    }
};

exports.default = indexedDBManager;

},{"./logger.js":5}],5:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var TYPES = {
    log: '[  LG  ] :: ',
    info: '[ INFO ] :: ',
    warn: '[ WARN ] :: ',
    error: '[ FAIL ] :: ',
    track: '[ STEP ] :: '
};

var logger = {
    info: function info() {
        var args = [].slice.call(arguments);
        args.unshift('color: blue');
        args.unshift('%c ' + TYPES.info);
        console.info.apply(console, args);
    },
    log: function log() {
        var args = [].slice.call(arguments);
        args.unshift('color: gray');
        args.unshift('%c ' + TYPES.log);
        console.log.apply(console, args);
    },
    warn: function warn() {
        var args = [].slice.call(arguments);
        args.unshift('font-weight: bold; color: yellow; text-shadow: 0 0 1px black;');
        args.unshift('%c ' + TYPES.warn);
        console.warn.apply(console, args);
    },
    error: function error() {
        var args = [].slice.call(arguments);
        args.unshift('font-weight: bold; color: red');
        args.unshift('%c ' + TYPES.error);
        console.error.apply(console, args);
    },
    track: function track() {
        var args = [].slice.call(arguments);
        args.unshift('font-weight: bold');
        args.unshift('%c ' + TYPES.track);
        console.debug.apply(console, args);
    }
};

exports.default = logger;

},{}],6:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _logger = require('./logger.js');

var _logger2 = _interopRequireDefault(_logger);

var _bestMatchingRx = require('./best-matching-rx.js');

var _bestMatchingRx2 = _interopRequireDefault(_bestMatchingRx);

var _cacheManager = require('./cache-manager.js');

var _cacheManager2 = _interopRequireDefault(_cacheManager);

var _goFetch = require('./go-fetch.js');

var _goFetch2 = _interopRequireDefault(_goFetch);

var _strategies = require('./strategies.js');

var _strategies2 = _interopRequireDefault(_strategies);

var _utils = require('./utils.js');

var _utils2 = _interopRequireDefault(_utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

var DSW = { version: '#@!THE_DSW_VERSION_INFO!@#', build: '#@!THE_DSW_BUILD_TIMESTAMP!@#', ready: null };
var REQUEST_TIME_LIMIT = 5000;
var REGISTRATION_TIMEOUT = 12000;
var DEFAULT_NOTIF_DURATION = 6000;
var currentlyMocking = {};

// These will be used in both ServiceWorker and Client scopes
DSW.isOffline = DSW.offline = function (_) {
    return !navigator.onLine;
};
DSW.isOnline = DSW.online = function (_) {
    return navigator.onLine;
};

// this try/catch is used simply to figure out the current scope
try {
    var SWScope = ServiceWorkerGlobalScope;
    if (self instanceof ServiceWorkerGlobalScope) {
        isInSWScope = true;
    }
} catch (e) {/* nothing...just had to find out the scope */}

if (isInSWScope) {
    (function () {

        var DSWManager = {
            requestId: 0,
            tracking: {},
            trackMoved: {},
            rules: {},
            addRule: function addRule(sts, rule, rx) {
                this.rules[sts] = this.rules[sts] || [];
                var newRule = {
                    name: rule.name,
                    rx: rx,
                    strategy: rule.strategy || 'offline-first',
                    action: rule['apply']
                };
                this.rules[sts].push(newRule);

                // if there is a rule for cache
                if (newRule.action.cache) {
                    // we will register it in the cacheManager
                    _cacheManager2.default.register(newRule);
                } else {
                    // if it is supposed NOT to cache
                    if (newRule.action.cache === false) {
                        newRule.strategy = 'online-first';
                    }
                }
                return newRule;
            },
            treatBadPage: function treatBadPage(response, pathName, event) {
                var result = void 0;
                DSWManager.traceStep(event.request, 'Request failed', {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    type: response.type
                });
                (DSWManager.rules[response && response.status ? response.status : 404] || []).some(function (cur, idx) {
                    var matching = pathName.match(cur.rx);
                    if (matching) {
                        if (cur.action.redirect && !cur.action.fetch) {
                            cur.action.fetch = cur.action.redirect;
                        }
                        if (cur.action.fetch) {
                            DSWManager.traceStep(event.request, 'Found fallback rule', cur, false, {
                                url: event.request.url,
                                id: event.request.requestId,
                                steps: event.request.traceSteps
                            });
                            // not found requests should
                            // fetch a different resource
                            var req = new Request(cur.action.fetch);
                            req.requestId = event.request.requestId;
                            req.traceSteps = event.request.traceSteps;
                            // applyMatch
                            result = _cacheManager2.default.get(cur, req, event, matching);
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
            setup: function setup() {
                var _this = this;

                var dswConfig = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

                // let's prepare both cacheManager and strategies with the
                // current referencies
                _utils2.default.setup(DSWManager, PWASettings, DSW);
                _cacheManager2.default.setup(DSWManager, PWASettings, _goFetch2.default);
                _strategies2.default.setup(DSWManager, _cacheManager2.default, _goFetch2.default);

                var ROOT_SW_SCOPE = new URL(location.href).pathname.replace(/\/[^\/]+$/, '/');

                return DSW.ready = new Promise(function (resolve, reject) {
                    // we will prepare and store the rules here, so it becomes
                    // easier to deal with, latelly on each requisition
                    var preCache = PWASettings.appShell || [],
                        dbs = [];

                    Object.keys(dswConfig.rules || dswConfig.dswRules).forEach(function (heuristic) {
                        var ruleName = heuristic;
                        heuristic = (dswConfig.rules || dswConfig.dswRules)[heuristic];
                        heuristic.name = ruleName;

                        heuristic.action = heuristic.action || heuristic['apply'];
                        var appl = heuristic.action,
                            extensions = void 0,
                            status = void 0,
                            path = void 0;

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
                            heuristic.match.map(function (cur) {
                                if (cur.extension) {
                                    extensions.push(cur.extension);
                                }
                                if (cur.path) {
                                    path.push(cur.path);
                                }
                            });
                            extensions = extensions.join('|');
                            if (extensions.length) {
                                extensions += '|';
                            }
                            path = (path.join('|') || '') + '|';
                        } else {
                            // "match" may be an object, then we simply use it
                            path = heuristic.match.path || '';
                            extensions = heuristic.match.extension, status = heuristic.match.status;
                        }

                        // preparing extentions to be added to the regexp
                        var ending = '([\/\&\?]|$)';
                        if (Array.isArray(extensions)) {
                            extensions = '([.+]?)(' + extensions.join(ending + '|') + ending + ')';
                        } else if (typeof extensions == 'string') {
                            extensions = '([.+]?)(' + extensions + ending + ')';
                        } else {
                            extensions = '';
                        }

                        // and now we "build" the regular expression itself!
                        var rx = new RegExp(path + (extensions ? '((\\.)((' + extensions + ')([\\?\&\/].+)?))' : ''), 'i');

                        // if it fetches something, and this something is not dynamic
                        // also, if it will redirect to some static url
                        var noVars = /\$[0-9]+/;
                        if (appl.fetch && !appl.fetch.match(noVars) || appl.redirect && !appl.redirect.match(noVars) || appl.cache && appl.cache.from) {
                            preCache.push({
                                url: appl.cache && appl.cache.from ? appl.cache.from : appl.fetch || appl.redirect,
                                rule: heuristic
                            });
                        }

                        // in case the rule uses an indexedDB
                        appl.indexedDB = appl.indexedDB || appl.idb || appl.IDB || undefined;
                        if (appl.indexedDB) {
                            dbs.push(appl.indexedDB);
                        }

                        // preparing status to store the heuristic
                        status = Array.isArray(status) ? status : [status || '*'];

                        // storing the new, shorter, optimized structure  of the
                        // rules for all the status that it should be applied to
                        status.forEach(function (sts) {
                            if (sts == 200) {
                                sts = '*';
                            }
                            var addedRule = _this.addRule(sts, heuristic, rx);
                        });
                    });

                    // adding the dsw itself to cache
                    _this.addRule('*', {
                        name: 'serviceWorker',
                        strategy: 'fastest',
                        match: { path: /^\/dsw.js(\?=dsw-manager)?$/ },
                        'apply': { cache: {} }
                    }, location.href);

                    // addinf the root path to be also cached by default
                    var rootMatchingRX = /^(\/|\/index(\.[0-1a-z]+)?)$/;
                    _this.addRule('*', {
                        name: 'rootDir',
                        strategy: 'fastest',
                        match: { path: rootMatchingRX },
                        'apply': { cache: {} }
                    }, rootMatchingRX);

                    preCache.unshift(ROOT_SW_SCOPE);

                    // if we've got urls to pre-store, let's cache them!
                    // also, if there is any database to be created, this is the time
                    if (preCache.length || dbs.length) {
                        // we fetch them now, and store it in cache
                        return Promise.all(preCache.map(function (cur) {
                            return _cacheManager2.default.add(cur.url || cur, null, null, cur.rule);
                        }).concat(dbs.map(function (cur) {
                            return _cacheManager2.default.createDB(cur);
                        }))).then(function (_) {
                            resolve();
                        }).catch(function (err) {
                            var errMessage = 'Failed storing the appShell! Could not register the service worker.' + '\nCould not find ' + (err.url || err.message) + '\n';
                            _logger2.default.error(errMessage, err);
                            reject(errMessage);
                        });
                    } else {
                        resolve();
                    }
                });
            },
            getRulesBeforeFetching: function getRulesBeforeFetching() {
                // returns all the rules for * or 200
                return this.rules['*'] || false;
            },
            createRequest: function createRequest(request, event, matching) {
                return (0, _goFetch2.default)(null, request, event, matching);
            },
            createRedirect: function createRedirect(request, event, matching) {
                return (0, _goFetch2.default)(null, request, event, matching);
            },
            traceStep: function traceStep(request, step, data) {
                var fill = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : false;
                var moved = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;


                // we may also receive a list of requests
                if (Array.isArray(request)) {
                    request.forEach(function (req) {
                        DSWManager.traceStep(req, step, data, fill, moved);
                    });
                    return;
                }

                // if there are no tracking listeners, this request will not be tracked
                if (DSWManager.tracking) {
                    var id = request.requestId;
                    request.traceSteps = request.traceSteps || [];
                    data = data || {};
                    if (fill) {
                        data.url = request.url;
                        data.type = request.type;
                        data.method = request.method;
                        data.redirect = request.redirect;
                        data.referrer = request.referrer;
                    }

                    var reqTime = (performance.now() - request.timeArriving) / 1000;

                    request.traceSteps.push({
                        step: step,
                        data: data,
                        timing: reqTime.toFixed(4) + 's' // timing from the begining of the request
                    });
                }
                // but if it has moved, we then track it
                if (moved) {
                    DSWManager.trackMoved[moved.url] = moved;
                }
            },
            respondItWith: function respondItWith(event, response) {
                // respond With This
                // first of all...we respond the event
                event.respondWith(new Promise(function (resolve, reject) {
                    if (typeof response.then == 'function') {
                        response.then(function (result) {
                            if (typeof result.clone != 'function') {
                                return resolve(result);
                            }
                            var response = result.clone();

                            // then, if it has been tracked, let's tell the listeners
                            if (DSWManager.tracking && response.status != 302) {
                                response.text().then(function (result) {
                                    // if the result is a string (text, html, etc)
                                    // we will preview only a small part of it
                                    if ((result[0] || '').charCodeAt(0) < 128) {
                                        result = result.substring(0, 180) + (result.length > 180 ? '...' : '');
                                    }
                                    DSWManager.traceStep(event.request, 'Responded', {
                                        response: {
                                            status: response.status,
                                            statusText: response.statusText,
                                            type: response.type,
                                            method: response.method,
                                            url: response.url
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
            sendTraceData: function sendTraceData(event) {
                var tracker = void 0;
                var traceBack = function traceBack(port, key) {
                    // sending the trace information back to client
                    var traceData = {
                        id: event.request.requestId,
                        src: event.request.traceSteps[0].data.url,
                        method: event.request.traceSteps[0].data.method,
                        steps: event.request.traceSteps
                    };
                    // if it has been redirected
                    if (traceData.src != event.request.url) {
                        traceData.redirectedTo = event.request.url;
                    }
                    port.postMessage(traceData);
                };
                // here we will send a message to each listener in the client(s)
                // with the trace information
                for (tracker in DSWManager.tracking) {
                    if (event.request.url.match(tracker)) {
                        DSWManager.tracking[tracker].ports.forEach(traceBack);
                        break;
                    }
                }

                // let's clear the garbage left from the request
                if (event.request.traceSteps && event.request.traceSteps.length) {
                    delete DSWManager.trackMoved[event.request.traceSteps[0].data.url];
                }
            },
            broadcast: function broadcast(message) {
                return clients.matchAll().then(function (result) {
                    result.forEach(function (cur) {
                        cur.postMessage(message);
                    });
                });
            },
            startListening: function startListening() {
                // and from now on, we listen for any request and treat it
                self.addEventListener('fetch', function (event) {

                    DSWManager.requestId = 1 + (DSWManager.requestId || 0);

                    if (DSWManager.trackMoved[event.request.url]) {
                        var movedInfo = DSWManager.trackMoved[event.request.url];
                        event.request.requestId = movedInfo.id;
                        event.request.traceSteps = movedInfo.steps;
                        event.request.originalSrc = movedInfo.url;
                        if (movedInfo.rule && movedInfo.rule.action && movedInfo.rule.action.cache && movedInfo.rule.action.cache.from) {
                            // it has moved, but is supposed to be cached from somewhere else
                            // because it uses variables that are not supposed to be cached
                            event.request.cachedFrom = movedInfo.rule.action.cache.from;
                        }
                        delete DSWManager.trackMoved[event.request.url];
                    } else {
                        // it is a brand new request
                        event.request.requestId = DSWManager.requestId;
                        event.request.timeArriving = performance.now();
                        DSWManager.traceStep(event.request, 'Arrived in Service Worker', {}, true);
                    }

                    var url = new URL(event.request.url);
                    var sameOrigin = url.origin == location.origin;
                    var pathName = url.pathname;

                    if (event.request.method != 'GET') {
                        DSWManager.traceStep(event.request, 'Ignoring ' + event.request.method + ' request', {});
                        DSWManager.sendTraceData(event);
                        return;
                    }

                    // in case there are no rules (happens when chrome crashes, for example)
                    if (!Object.keys(DSWManager.rules).length) {
                        return DSWManager.setup(PWASettings).then(function (_) {
                            return fetch(event);
                        });
                    }

                    // in case we want to enforce https
                    if (PWASettings.enforceSSL) {
                        if (url.protocol != 'https:' && url.hostname != 'localhost') {
                            DSWManager.traceStep(event.request, 'Redirected from http to https');
                            return DSWManager.respondItWith(event, Response.redirect(event.request.url.replace('http:', 'https:'), 302));
                        }
                    }

                    // get the best fiting rx for the path, to find the rule that
                    // matches the most
                    var matchingRule = void 0;
                    if (!sameOrigin) {
                        matchingRule = (0, _bestMatchingRx2.default)(url.origin + url.pathname, DSWManager.rules['*']);
                    } else {
                        matchingRule = (0, _bestMatchingRx2.default)(pathName, DSWManager.rules['*']);
                    }
                    if (matchingRule) {
                        // if there is a rule that matches the url
                        DSWManager.traceStep(event.request, 'Best matching rule found: "' + matchingRule.rule.name + '"', {
                            rule: matchingRule.rule,
                            url: event.request.url
                        });
                        return DSWManager.respondItWith(event,
                        // we apply the right strategy for the matching rule
                        _strategies2.default[matchingRule.rule.strategy](matchingRule.rule, event.request, event, matchingRule.matching));
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
                    var defaultTreatment = function defaultTreatment(response) {
                        if (response && (response.status == 200 || response.type == 'opaque' || response.type == 'opaqueredirect')) {
                            return response;
                        } else {
                            return DSWManager.treatBadPage(response, pathName, event);
                        }
                    };

                    // once no rule matched, we simply respond the event with a fetch
                    return DSWManager.respondItWith(event, fetch((0, _goFetch2.default)(null, event.request))
                    // but we will still treat the rules that use the status
                    .then(defaultTreatment).catch(defaultTreatment));
                });
            }
        };

        var DSWStatus = false;
        self.addEventListener('activate', function (event) {
            event.waitUntil(function (_) {
                var promises = [];
                if (PWASettings.applyImmediately) {
                    promises.push(self.clients.claim());
                }
                promises.push(_cacheManager2.default.deleteUnusedCaches(PWASettings.keepUnusedCaches));
                return Promise.all(promises).then(function (_) {
                    DSWManager.broadcast({ DSWStatus: DSWStatus });
                }).catch(function (err) {
                    DSWManager.broadcast({ DSWStatus: DSWStatus });
                });
            }());
        });

        self.addEventListener('install', function (event) {
            // undoing some bad named properties :/
            PWASettings.dswRules = PWASettings.rules || PWASettings.dswRules || {};
            PWASettings.dswVersion = PWASettings.version || PWASettings.dswVersion || '1';

            if (PWASettings.applyImmediately) {
                return event.waitUntil(DSWManager.setup(PWASettings).then(function (_) {
                    DSWStatus = true;
                    self.skipWaiting();
                }).catch(function (_) {
                    self.skipWaiting();
                }));
            } else {
                return event.waitUntil(DSWManager.setup(PWASettings));
            }
        });

        self.addEventListener('message', function (event) {
            var ports = event.ports;
            if (event.data.trackPath) {
                var tp = event.data.trackPath;
                DSWManager.tracking[tp] = {
                    rx: new RegExp(tp, 'i'),
                    ports: ports
                };
                return;
            }
            if (event.data.clearEverythingUp) {
                _cacheManager2.default.clear().then(function (result) {
                    ports.forEach(function (port) {
                        port.postMessage({
                            cacheCleaned: true
                        });
                    });
                });
                return;
            }
            if (event.data.enableMocking) {
                var mockId = event.data.enableMocking.mockId;
                var matching = event.data.enableMocking.match;
                var finalMockId = mockId + matching;
                // we will mock only for some clients (this way you can have two tabs with different approaches)
                currentlyMocking[event.source.id] = currentlyMocking[event.source.id] || {};
                var client = currentlyMocking[event.source.id];
                // this client will mock the rules in mockId
                client[finalMockId] = client[finalMockId] || [];
                currentlyMocking[finalMockId].push();
                // TODO: add mock support
                return;
            }
        });

        self.addEventListener('push', function (event) {

            // let's trigger the event
            DSWManager.broadcast({
                event: 'pushnotification',
                data: event.data
            });

            if (PWASettings.notification && PWASettings.notification.dataSrc) {
                // if there is a dataSrc defined, we fetch it
                return event.waitUntil(fetch(PWASettings.notification.dataSrc).then(function (response) {
                    if (response.status == 200) {
                        // then to use it as the structure for the notification
                        return response.json().then(function (data) {
                            var notifData = {};
                            if (PWASettings.notification.dataPath) {
                                notifData = data[PWASettings.notification.dataPath];
                            } else {
                                notifData = data;
                            }
                            var notif = self.registration.showNotification(notifData.title, {
                                'body': notifData.body || notifData.content || notifData.message,
                                'icon': notifData.icon || notifData.image,
                                'tag': notifData.tag || null
                            });
                        });
                    } else {
                        throw new Error('Fetching ' + PWASettings.notification.dataSrc + ' returned a ' + response.status + ' status.');
                    }
                }).catch(function (err) {
                    _logger2.default.warn('Received a push, but Failed retrieving the notification data.', err);
                }));
            } else if (PWASettings.notification.title) {
                // you can also specify the message data
                var n = PWASettings.notification;
                var notif = self.registration.showNotification(n.title, {
                    'body': n.body || n.content || n.message,
                    'icon': n.icon || n.image,
                    'tag': n.tag || null
                });
            }
        });

        // When user clicks/touches the notification, we shall close it and open
        // or focus the web page
        self.addEventListener('notificationclick', function (event) {
            var tag = event.notification.tag,
                targetUrl = void 0,
                eventData = {
                tag: tag,
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
            if (PWASettings.notification && PWASettings.notification.target !== void 0) {
                targetUrl = PWASettings.notification.target;
            } else {
                targetUrl = location.toString();
            }

            event.waitUntil(
            // let's look for all windows(or frames) that are using our sw
            clients.matchAll({
                type: 'window'
            }).then(function (windowClients) {
                var p = void 0;
                // and let's see if any of these is already our page
                for (var i = 0; i < windowClients.length; i++) {
                    var client = windowClients[i];
                    // if it is, we simply focus it
                    if ((client.url == targetUrl || new URL(client.url).pathname == targetUrl) && 'focus' in client) {
                        p = client.focus();
                        break;
                    }
                }
                // if it is not opened, we open it
                if (!p && targetUrl && clients.openWindow) {
                    p = clients.openWindow(targetUrl);
                } else {
                    // if not, we simply resolve it
                    p = Promise.resolve();
                }

                // now we execute the promise (either a openWindow or focus)
                p.then(function (_) {
                    // and then trigger the event
                    DSWManager.broadcast({
                        event: 'notificationclicked',
                        data: eventData
                    });
                });
            }));
        });

        self.addEventListener('sync', function (event) {
            // TODO: add support to sync event as browsers evolve and support the feature
            //debugger;
        });

        DSWManager.startListening();
    })();
} else {
    (function () {

        DSW.status = {
            version: PWASettings.version || PWASettings.dswVersion,
            registered: false,
            sync: false,
            appShell: false,
            notification: false
        };

        var pendingResolve = void 0,
            pendingReject = void 0,
            registeredServiceWorker = void 0,
            installationTimeOut = void 0;

        var eventManager = function () {
            var events = {};
            return {
                addEventListener: function addEventListener(eventName, listener) {
                    events[eventName] = events[eventName] || [];
                    events[eventName].push(listener);
                },
                trigger: function trigger(eventName) {
                    var data = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

                    var listener = void 0;
                    try {
                        if (events[eventName]) {
                            var _iteratorNormalCompletion = true;
                            var _didIteratorError = false;
                            var _iteratorError = undefined;

                            try {
                                for (var _iterator = events[eventName][Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                                    listener = _step.value;

                                    if (typeof listener == 'function') {
                                        listener(data);
                                    }
                                }
                            } catch (err) {
                                _didIteratorError = true;
                                _iteratorError = err;
                            } finally {
                                try {
                                    if (!_iteratorNormalCompletion && _iterator.return) {
                                        _iterator.return();
                                    }
                                } finally {
                                    if (_didIteratorError) {
                                        throw _iteratorError;
                                    }
                                }
                            }
                        }

                        listener = 'on' + eventName;
                        if (typeof DSW[listener] == 'function') {
                            DSW[listener](data);
                        }
                    } catch (e) {
                        if (listener && listener.name) {
                            listener = listener.name;
                        } else {
                            listener = listener || 'annonymous';
                        }
                        _logger2.default.error('Failed trigerring event ' + eventName + ' on listener ' + listener, e.message, e);
                    }
                }
            };
        }();

        // let's store some events, so it can be autocompleted in devTools
        DSW.addEventListener = eventManager.addEventListener;
        DSW.onpushnotification = function () {/* use this to know when a notification arrived */};
        DSW.onnotificationclicked = function () {/* use this to know when the user has clicked in a notification */};
        DSW.onenabled = function () {/* use this to know when DSW is enabled and running */};
        DSW.onregistered = function () {/* use this to know when DSW has been registered */};
        DSW.onunregistered = function () {/* use this to know when DSW has been unregistered */};
        DSW.onnotificationsenabled = function () {/* use this to know when user has enabled notifications */};

        navigator.serviceWorker.addEventListener('message', function (event) {
            // if it is waiting for the installation confirmation
            if (pendingResolve && event.data.DSWStatus !== void 0) {
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
            messageChannel.port1.onmessage = function (event) {
                callback(event.data);
            };

            navigator.serviceWorker.controller.postMessage({ trackPath: match }, [messageChannel.port2]);
        };

        DSW.enableMocking = function (mockId) {
            var match = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '.*';

            var messageChannel = new MessageChannel();
            navigator.serviceWorker.controller.postMessage({ enableMocking: { mockId: mockId, match: match } }, [messageChannel.port2]);
        };
        DSW.disableMocking = function (mockId) {
            var match = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '.*';

            var messageChannel = new MessageChannel();
            navigator.serviceWorker.controller.postMessage({ disableMocking: { mockId: mockId, match: match } }, [messageChannel.port2]);
        };

        DSW.sendMessage = function (message) {
            var waitForAnswer = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;

            // This method sends a message to the service worker.
            // Useful for specific tokens and internal use and trace
            return new Promise(function (resolve, reject) {
                var messageChannel = new MessageChannel();

                // in case the user expects an answer from the SW after sending
                // this message...
                if (waitForAnswer) {
                    // we will wait for it, and then resolve or reject only when
                    // the SW has answered
                    messageChannel.port1.onmessage = function (event) {
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
                navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
            });
        };

        DSW.onNetworkStatusChange = function (callback) {
            var cb = function cb() {
                callback(navigator.onLine);
            };
            window.addEventListener('online', cb);
            window.addEventListener('offline', cb);
            // in case we are already offline, we will trigger now, the callback
            // this way, fevelopers will know right away that their app has loaded
            // offline
            if (!navigator.onLine) {
                cb();
            }
        };

        // this means all the appShell dependencies have been downloaded and
        // the sw has been successfuly installed and registered
        DSW.isAppShellDone = DSW.isActivated = function (_) {
            return DSW.status.registered && DSW.status.appShell;
        };
        DSW.isRegistered = function (_) {
            return DSW.status.registered;
        };

        // this method will register the SW for push notifications
        // but is not really connected to web notifications (the popup message)
        DSW.enableNotifications = function (_) {
            return new Promise(function (resolve, reject) {
                if (navigator.onLine) {
                    navigator.serviceWorker.ready.then(function (reg) {
                        var req = reg.pushManager.subscribe({
                            userVisibleOnly: true
                        });
                        return req.then(function (sub) {
                            DSW.status.notification = sub.endpoint;
                            eventManager.trigger('notificationsenabled', DSW.status);
                            _logger2.default.info('Registered to notification server');
                            resolve(sub);
                        }).catch(function (reason) {
                            reject(reason || 'Not allowed by user');
                        });
                    });
                } else {
                    reject('Must be connected to enable notifications');
                }
            });
        };

        DSW.notify = function () {
            var title = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'Untitled';
            var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

            return new Promise(function (resolve, reject) {
                DSW.enableNotifications().then(function (_) {
                    var opts = {
                        body: options.body || '',
                        icon: options.icon || false,
                        tag: options.tag || null
                    };
                    var n = new Notification(title, opts);
                    if (options.duration) {
                        setTimeout(function (_) {
                            n.close();
                        }, options.duration * 1000);
                    }
                    resolve(n);
                }).catch(function (reason) {
                    reject(reason);
                });
            });
        };

        DSW.unregister = function (_) {
            return new Promise(function (resolve, reject) {
                DSW.ready.then(function (result) {
                    _cacheManager2.default.clear() // firstly, we clear the caches
                    .then(function (result) {
                        if (result) {
                            DSW.status.appShell = false;
                            localStorage.setItem('DSW-STATUS', JSON.stringify(DSW.status));
                            // now we try and unregister the ServiceWorker
                            registeredServiceWorker.unregister().then(function (success) {
                                if (success) {
                                    DSW.status.registered = false;
                                    DSW.status.sync = false;
                                    DSW.status.notification = false;
                                    DSW.status.ready = false;
                                    localStorage.setItem('DSW-STATUS', JSON.stringify(DSW.status));
                                    resolve(DSW.status);
                                    eventManager.trigger('unregistered', DSW.status);
                                } else {
                                    reject('Could not unregister service worker');
                                }
                            });
                            // TODO: clear indexedDB too
                            // indexedDBManager.delete();
                        } else {
                            reject('Could not clean up the caches');
                        }
                    });
                });
            });
        };

        // client's setup
        DSW.setup = function () {
            var config = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};


            // in case DSW.setup has already been called
            if (DSW.ready) {
                return DSW.ready;
            }

            return new Promise(function (resolve, reject) {
                // this promise rejects in case of errors, and only resolved in case
                // the service worker has just been registered.

                DSW.ready = new Promise(function (resolve, reject) {

                    var appShellPromise = new Promise(function (resolve, reject) {
                        pendingResolve = function pendingResolve() {
                            clearTimeout(installationTimeOut);
                            resolve(DSW.status);
                        };
                    });
                    pendingReject = function pendingReject(reason) {
                        clearTimeout(installationTimeOut);
                        reject(reason || 'Installation timeout');
                    };

                    // opening on a page scope...let's install the worker
                    if (navigator.serviceWorker) {
                        if (!navigator.serviceWorker.controller) {
                            // rejects the registration after some time, if not resolved by then
                            installationTimeOut = setTimeout(function (_) {
                                reject('Registration timed out');
                            }, config.timeout || REGISTRATION_TIMEOUT);

                            // we will use the same script, already loaded, for our service worker
                            var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
                            navigator.serviceWorker.register(src).then(function (SW) {
                                registeredServiceWorker = SW;
                                DSW.status.registered = true;

                                navigator.serviceWorker.ready.then(function (reg) {

                                    DSW.status.ready = true;
                                    eventManager.trigger('registered', DSW.status);

                                    Promise.all([appShellPromise, new Promise(function (resolve, reject) {
                                        if (PWASettings.notification && PWASettings.notification.auto) {
                                            return DSW.enableNotifications();
                                        } else {
                                            resolve();
                                        }
                                    }), new Promise(function (resolve, reject) {
                                        // setting up sync
                                        if (config && config.sync) {
                                            if ('SyncManager' in window) {
                                                navigator.serviceWorker.ready.then(function (reg) {
                                                    return reg.sync.register('syncr');
                                                }).then(function (_) {
                                                    DSW.status.sync = true;
                                                    resolve();
                                                });
                                            } else {
                                                DSW.status.sync = 'Failed enabling sync';
                                                resolve();
                                            }
                                        } else {
                                            resolve();
                                        }
                                    })]).then(function (_) {
                                        localStorage.setItem('DSW-STATUS', JSON.stringify(DSW.status));
                                        eventManager.trigger('enabled', DSW.status);
                                        _logger2.default.info('Service Worker was registered', DSW.status);
                                        resolve(DSW.status);
                                    });
                                });
                            }).catch(function (err) {
                                reject({
                                    status: false,
                                    sync: false,
                                    sw: false,
                                    message: 'Failed registering service worker with the message:\n ' + err.message,
                                    error: err
                                });
                            });
                        } else {
                            // service worker was already registered and is active
                            // setting up traceable requests
                            if (config && config.trace) {
                                navigator.serviceWorker.ready.then(function (reg) {
                                    registeredServiceWorker = reg;
                                    var match = void 0;
                                    for (match in config.trace) {
                                        DSW.trace(match, config.trace[match]);
                                    }
                                });
                            } else {
                                navigator.serviceWorker.ready.then(function (reg) {
                                    registeredServiceWorker = reg;
                                });
                            }
                            // on refreshes, we update the variable to be used in the API
                            DSW.status = JSON.parse(localStorage.getItem('DSW-STATUS'));
                            resolve(DSW.status);
                        }
                    } else {
                        DSW.status.fail = 'Service worker not supported';
                    }
                });

                // if it is not activated, we return the "ready" promise
                if (!DSW.isActivated()) {
                    return DSW.ready.then(function (result) {
                        resolve(result);
                    }).catch(function (reason) {
                        reject(reason);
                    });
                }
            });
        };

        if (typeof window !== 'undefined') {
            window.DSW = DSW;
        }
    })();
}

exports.default = DSW;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./best-matching-rx.js":1,"./cache-manager.js":2,"./go-fetch.js":3,"./logger.js":5,"./strategies.js":7,"./utils.js":8}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _utils = require('./utils.js');

var _utils2 = _interopRequireDefault(_utils);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var DSWManager = void 0;
var cacheManager = void 0;
var goFetch = void 0;

var strategies = {
    setup: function setup(dswM, cacheM, gf) {
        DSWManager = dswM;
        cacheManager = cacheM;
        goFetch = gf;
    },
    'offline-first': function offlineFirstStrategy(rule, request, event, matching) {
        // Will look for the content in cache
        // if it is not there, will fetch it,
        // store it in the cache
        // and then return it to be used
        DSWManager.traceStep(event.request, 'Info: Using offline first strategy', { url: request.url });
        return cacheManager.get(rule, request, event, matching);
    },
    'online-first': function onlineFirstStrategy(rule, request, event, matching) {
        // Will fetch it, and if there is a problem
        // will look for it in cache
        DSWManager.traceStep(event.request, 'Info: Using online first strategy', { url: request.url });
        function treatIt(response) {
            if (response.status == 200) {
                if (rule.action.cache) {
                    // we will update the cache, in background
                    cacheManager.put(rule, request, response).then(function (_) {
                        DSWManager.traceStep(event.request, 'Updated cache');
                    });
                }
                return response;
            }
            return cacheManager.get(rule, request, event, matching).then(function (result) {
                // if failed to fetch and was not in cache, we look
                // for a fallback response
                var pathName = new URL(event.request.url).pathname;
                return result || DSWManager.treatBadPage(response, pathName, event);
            });
        }

        // if browser is offline, there is no need to try the request
        if (_utils2.default.DSW.isOffline()) {
            return treatIt(new Response('', {
                status: 404,
                statusText: 'Browser is offline',
                headers: {
                    'Content-Type': 'text/plain'
                }
            }));
        }

        return goFetch(rule, request, event, matching).then(treatIt).catch(treatIt);
    },
    'fastest': function fastestStrategy(rule, request, event, matching) {
        DSWManager.traceStep(event.request, 'Info: Using fastest strategy', { url: request.url });
        // Will fetch AND look in the cache.
        // The cached data will be returned faster
        // but once the fetch request returns, it updates
        // what is in the cache (keeping it up to date)
        var pathName = new URL(event.request.url).pathname;
        var networkTreated = false,
            cacheTreated = false,
            networkFailed = false,
            cacheFailed = false;

        // fetch at the same time from the network and from cache
        // in fail function, verify if it failed for both, then treatBadRequest
        // in success, the first to have a 200 response, resolves it
        return new Promise(function (resolve, reject) {
            function treatFetch(response) {
                var result = void 0;

                // firstly, let's asure we update the cache, if needed
                if (response && response.status == 200) {
                    // if we managed to load it from network and it has
                    // cache in its actions, we cache it
                    if (rule.action.cache) {
                        // we will update the cache, in background
                        cacheManager.put(rule, request, response).then(function (_) {
                            DSWManager.traceStep(event.request, 'Updated cache');
                        });
                    }
                }

                // if cache has not resolved it yet
                if (!cacheTreated) {
                    // if it downloaded well, we use it (probably the first access)
                    if (response.status == 200) {
                        networkTreated = true;
                        // if cache could not resolve it, the network resolves
                        DSWManager.traceStep(event.request, 'Fastest strategy resolved from network', {
                            url: response.url || request.url
                        });
                        resolve(response);
                    } else {
                        // if it failed, we will try and respond with
                        // something else
                        DSWManager.traceStep(event.request, 'Fastest strategy failed fetching', {
                            status: response.status,
                            statusText: response.statusText
                        });
                        networkFailed = true;
                        treatCatch(response);
                    }
                }
            }

            function treatCache(result) {
                // if it was in cache, and network hasn't resolved previously
                if (result && !networkTreated) {
                    cacheTreated = true; // this will prevent network from resolving too
                    DSWManager.traceStep(event.request, 'Fastest strategy resolved from cached');
                    resolve(result);
                    return result;
                } else {
                    // lets flag cache as failed, once it's not there
                    cacheFailed = true;
                    treatCatch();
                }
            }

            function treatCatch(response) {
                // if both network and cache failed,
                // we have a problem with the request, let's treat it
                if (networkFailed && cacheFailed) {
                    DSWManager.traceStep(event.request, 'Fastest strategy could not fetch nor find in cache');
                    resolve(DSWManager.treatBadPage(response, pathName, event));
                }
                // otherwise, we still got a chance on having a result from
                // one of the sources (network or cache), and keep waiting for it
            }

            // one promise go for the network
            // if browser is offline, there is no need to try the request
            goFetch(rule, request.clone(), event, matching).then(treatFetch).catch(treatFetch);

            // the other, for the cache
            cacheManager.get(rule, request, event, matching, false, false) // will get, but not treat any failure
            .then(treatCache).catch(treatCatch);
        });
    }
};

exports.default = strategies;

},{"./utils.js":8}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var utils = {
    DSWManager: null,
    PWASettings: null,
    // Applies the matched patterns into strings (used to replace variables)
    applyMatch: function applyMatch(matching, text) {
        if (matching && matching.length > 1 && text) {
            // we apply the variables
            matching.forEach(function (cur, idx) {
                text = text.replace(new RegExp('\\$' + idx, 'i'), cur);
            });
        }
        return text;
    },
    createRequest: function createRequest(request, reqData) {
        var reqConfig = {
            method: reqData.method || request.method || 'GET',
            headers: reqData.headers || request.headers || new Headers(),
            mode: reqData.mode || (reqData.redirect ? 'same-origin' : 'cors'),
            redirect: reqData.redirect || 'manual',
            cache: 'default'
        };

        var req = new Request(request.url || request, reqConfig);
        req.requestId = request.requestId;
        return req;
    },
    setup: function setup(DSWManager, PWASettings, DSW) {
        utils.DSWManager = DSWManager;
        utils.PWASettings = PWASettings;
        utils.DSW = DSW;
    }
};

exports.default = utils;

},{}]},{},[6]);
