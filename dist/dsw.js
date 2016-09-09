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
                            cache.put(request, response.clone());
                        }
                        resolve(response);
                        // in case it is supposed to expire
                        if (rule && rule.action && rule.action.cache && rule.action.cache.expires) {
                            // saves the current time for further validation
                            cacheManager.setExpiringTime(request, rule || cacheId, rule.action.cache.expires);
                        }
                    }).catch(function (err) {
                        _logger2.default.error(err);
                        resolve(response);
                    });
                } else {
                    reject(response);
                }
            }

            if (!response) {
                fetch(goFetch(null, request)).then(addIt).catch(function (err) {
                    _logger2.default.error('[ DSW ] :: Failed fetching ' + (request.url || request), err);
                    reject(response);
                });
            } else {
                addIt(response);
            }
        });
    },
    setExpiringTime: function setExpiringTime(request, rule) {
        var expiresAt = arguments.length <= 2 || arguments[2] === undefined ? 0 : arguments[2];

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
        var verifyCache = void 0;
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
                        _logger2.default.info('Bypassing request, going for the network for', request.url);

                        var treatResponse = function treatResponse(response) {
                            if (response.status >= 200 && response.status < 300) {
                                return response;
                            } else {
                                _logger2.default.info('Bypassed request for ', request.url, 'failed and was, therefore, ignored');
                                return new Response(''); // ignored
                            }
                        };
                        // here we will use a "raw" fetch, instead of goFetch, which would
                        // create a new Request and define propreties to it
                        return fetch(event.request).then(treatResponse).catch(treatResponse);
                    } else {
                        // or of type 'ignore' (or anything else, actually)
                        // and we will simply output nothing, as if ignoring both the
                        // request and response
                        actionType = 'output';
                        rule.action[actionType] = '';
                        _logger2.default.info('Bypassing request, outputing nothing out of it');
                    }
                }
            case 'output':
                {
                    return new Response(_utils2.default.applyMatch(matching, rule.action[actionType]));
                }
            case 'indexeddb':
                {
                    return new Promise(function (resolve, reject) {
                        // function to be used after fetching
                        function treatFetch(response) {
                            if (response && response.status == 200) {
                                // with success or not(saving it), we resolve it
                                var done = function done(_) {
                                    resolve(response);
                                };

                                // store it in the indexedDB
                                _indexeddbManager2.default.save(rule.name, response.clone(), request, rule).then(done).catch(done); // if failed saving, we still have the reponse to deliver
                            } else {
                                // if it failed, we can look for a fallback
                                url = request.url;
                                pathName = new URL(url).pathname;
                                return DSWManager.treatBadPage(response, pathName, event);
                            }
                        }

                        // let's look for it in our cache, and then in the database
                        // (we use the cache, just so we can user)
                        _indexeddbManager2.default.get(rule.name, request).then(function (result) {
                            // if we did have it in the indexedDB
                            if (result) {
                                // we use it
                                return treatFetch(result);
                            } else {
                                // if it was not stored, let's fetch it
                                //request = DSWManager.createRequest(request, event, matching);
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

                    if (rule.action.cache) {
                        cacheId = cacheManager.mountCacheId(rule);
                    }

                    // lets verify if the cache is expired or not
                    return verifyCache.then(function (expired) {
                        var lookForCache = void 0;
                        if (expired && !forceFromCache) {
                            // in case it has expired, it resolves automatically
                            // with no results from cache
                            lookForCache = Promise.resolve();
                            _logger2.default.info('Cache expired for ', request.url);
                        } else {
                            // if not expired, let's look for it!
                            lookForCache = caches.match(request);
                        }

                        // look for the request in the cache
                        return lookForCache.then(function (result) {
                            // if it does not exist (cache could not be verified)
                            if (result && result.status != 200) {
                                // if it has expired in cache, failed requests for
                                // updates should return the previously cached data
                                // even if it has expired
                                if (expired) {
                                    // the true argument flag means it should come from cache, anyways
                                    return cacheManager.get(rule, request, event, matching, true);
                                }
                                // look for rules that match for the request and its status
                                (DSWManager.rules[result.status] || []).some(function (cur, idx) {
                                    if (pathName.match(cur.rx)) {
                                        // if a rule matched for the status and request
                                        // and it tries to fetch a different source
                                        if (cur.action.fetch || cur.action.redirect) {
                                            // problematic requests should
                                            result = goFetch(rule, request, event, matching);
                                            return true; // stopping the loop
                                        }
                                    }
                                });
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
                                    var treatFetch = function treatFetch(response) {

                                        if (response.type == 'opaque') {
                                            // if it is a opaque response, let it go!
                                            if (rule.action.cache !== false) {
                                                return cacheManager.add(_utils2.default.createRequest(request, { mode: 'no-cors' }), cacheManager.mountCacheId(rule), response, rule);
                                            }
                                            return response;
                                        }

                                        if (!response.status) {
                                            response.status = 404;
                                        }
                                        // after retrieving it, we cache it
                                        // if it was ok
                                        if (response.status == 200) {
                                            // if cache is not false, it will be added to cache
                                            if (rule.action.cache !== false) {
                                                // and if it shall expire, let's schedule it!
                                                return cacheManager.add(request, cacheManager.mountCacheId(rule), response, rule);
                                            } else {
                                                return response;
                                            }
                                        } else {
                                            // if it had expired, but could not be retrieved
                                            // from network, let's give its cache a chance!
                                            if (expired) {
                                                _logger2.default.warn('Cache for ', request.url || request, 'had expired, but the updated version could not be retrieved from the network!\n', 'Delivering the outdated cached data');
                                                return cacheManager.get(rule, request, event, matching, true);
                                            }
                                            // otherwise...let's see if there is a fallback
                                            // for the 404 requisition
                                            return DSWManager.treatBadPage(response, pathName, event);
                                        }
                                    };
                                    return goFetch(rule, request, event, matching) // fetch(req, opts)
                                    .then(treatFetch).catch(treatFetch);
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

var origin = location.origin; // (location.hostname.match(/(.+\.)?(.+)\./) || [location.hostname]).pop();

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
        return new Request(tmpUrl, {
            method: request.method || 'GET',
            headers: request.headers || {},
            mode: sameOrigin ? 'cors' : 'no-cors',
            cache: 'default',
            redirect: 'manual'
        });
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
        reqConfig.mode = 'no-cors';
    }
    request = new Request(tmpUrl || request.url, reqConfig);

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
    var mode = arguments.length <= 1 || arguments[1] === undefined ? 'readwrite' : arguments[1];

    var db = dbs[dbName],
        tx = db.transaction(dbName, mode);
    return tx.objectStore(dbName);
}

var indexedDBManager = {
    setup: function setup(cm) {
        cacheManager = cm;
    },
    create: function create(config) {
        return new Promise(function (resolve, reject) {

            var request = indexedDB.open(config.name || DEFAULT_DB_NAME, parseInt(config.version, 10) || undefined);

            function dataBaseReady(db, dbName, resolve) {
                db.onversionchange = function (event) {
                    db.close();
                    _logger2.default.log('There is a new version of the database(IndexedDB) for ' + config.name);
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
            var store = getObjectStore(dbName);
            // We will actuallly look for its IDs in cache, to use them to find
            // the real, complete object in the indexedDB
            caches.match(request).then(function (result) {
                if (result) {
                    result.json().then(function (obj) {
                        // if the request was in cache, we now have got
                        // the id=value for the indexes(keys) to look for,
                        // in the indexedDB!
                        var store = getObjectStore(dbName),
                            index = store.index(obj.key),
                            getter = index.get(obj.value);
                        // in case we did get the content from indexedDB
                        // let's create a new Response out of it!
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
                    });
                } else {
                    resolve();
                }
            });
        });
    },


    find: function find(dbName, key, value) {
        return new Promise(function (resolve, reject) {
            var store = getObjectStore(dbName),
                index = store.index(key),
                getter = index.get(value);

            getter.onsuccess = function (event) {
                resolve(event.target.result);
            };
            getter.onerror = function (event) {
                reject();
            };
        });
    },

    addOrUpdate: function addOrUpdate(obj, dbName) {
        return new Promise(function (resolve, reject) {
            var store = getObjectStore(dbName);
            var req = store.put(obj);
            req.onsuccess = function addOrUpdateSuccess() {
                resolve(obj);
            };
            req.onerror = function addOrUpdateError(err) {
                resolve(obj);
            };
        });
    },
    save: function save(dbName, data, request, rule) {
        return new Promise(function (resolve, reject) {

            data.json().then(function (obj) {

                var store = getObjectStore(dbName),
                    req = void 0;

                req = store.add(obj);

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
                    reject('Failed saving to the indexedDB!', this.error);
                };
            }).catch(function (err) {
                _logger2.default.error('Failed saving into indexedDB!\n', err.message, err);
                reject('Failed saving into indexedDB!');
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

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

var DSW = {};
var REQUEST_TIME_LIMIT = 5000;
var COMM_HAND_SHAKE = 'seting-dsw-communication-up';

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
            tracking: {},
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
                }
                return newRule;
            },
            treatBadPage: function treatBadPage(response, pathName, event) {
                var result = void 0;
                (DSWManager.rules[response && response.status ? response.status : 404] || []).some(function (cur, idx) {
                    var matching = pathName.match(cur.rx);
                    if (matching) {
                        if (cur.action.fetch) {
                            // not found requisitions should
                            // fetch a different resource
                            _logger2.default.info('Found fallback rule for ', pathName, '\nLooking for its result');
                            result = _cacheManager2.default.get(cur, new Request(cur.action.fetch), event, matching);
                            return true; // stopping the loop
                        }
                    }
                });
                if (!result) {
                    _logger2.default.info('No rules for failed request: ', pathName, '\nWill output the failure');
                }
                return result || response;
            },
            setup: function setup() {
                var _this = this;

                var dswConfig = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

                // let's prepare both cacheManager and strategies with the
                // current referencies
                _cacheManager2.default.setup(DSWManager, PWASettings, _goFetch2.default);
                _strategies2.default.setup(DSWManager, _cacheManager2.default, _goFetch2.default);

                return new Promise(function (resolve, reject) {
                    // we will prepare and store the rules here, so it becomes
                    // easier to deal with, latelly on each requisition
                    var preCache = PWASettings.appShell || [],
                        dbs = [];

                    Object.keys(dswConfig.dswRules).forEach(function (heuristic) {
                        var ruleName = heuristic;
                        heuristic = dswConfig.dswRules[heuristic];
                        heuristic.name = ruleName;

                        heuristic.action = heuristic.action || heuristic['apply'];
                        var appl = heuristic.action,
                            extensions = void 0,
                            status = void 0,
                            path = void 0;

                        // in case "match" is an array
                        // we will treat it as an "OR"
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
                            path = heuristic.match.path || ''; // aqui + '([.+]?)';
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
                        if (appl.fetch && !appl.fetch.match(noVars) || appl.redirect && !appl.redirect.match(noVars)) {
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
                        match: { path: /^\/dsw.js(\?=dsw-manager)?$/ },
                        'apply': { cache: {} }
                    }, location.href);

                    // addinf the root path to be also cached by default
                    var rootMatchingRX = /^(\/|\/index(\.[0-1a-z]+)?)$/;
                    _this.addRule('*', {
                        name: 'rootDir',
                        match: { path: rootMatchingRX },
                        'apply': { cache: {} }
                    }, rootMatchingRX);

                    preCache.unshift('/');

                    // if we've got urls to pre-store, let's cache them!
                    // also, if there is any database to be created, this is the time
                    if (preCache.length || dbs.length) {
                        // we fetch them now, and store it in cache
                        return Promise.all(preCache.map(function (cur) {
                            return _cacheManager2.default.add(cur.url || cur, null, null, cur.rule);
                        }).concat(dbs.map(function (cur) {
                            return _cacheManager2.default.createDB(cur);
                        }))).then(resolve);
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
            respondItWith: function respondItWith(event, response) {
                // respondWithThis
                event.respondWith(response);
                //DSWManager.tracking
            },
            startListening: function startListening() {
                // and from now on, we listen for any request and treat it
                self.addEventListener('fetch', function (event) {

                    DSW.requestId = 1 + (DSW.requestId || 0);

                    // in case there are no rules (happens when chrome crashes, for example)
                    if (!Object.keys(DSWManager.rules).length) {
                        return DSWManager.setup(PWASettings).then(function (_) {
                            return fetch(event);
                        });
                    }

                    var url = new URL(event.request.url);
                    var pathName = url.pathname;

                    // in case we want to enforce https
                    if (PWASettings.enforceSSL) {
                        if (url.protocol != 'https:' && url.hostname != 'localhost') {
                            return DSWManager.respondItWith(event, Response.redirect(event.request.url.replace('http:', 'https:'), 302));
                        }
                    }

                    // get the best fiting rx for the path, to find the rule that
                    // matches the most
                    var matchingRule = (0, _bestMatchingRx2.default)(pathName, DSWManager.rules['*']);
                    if (matchingRule) {
                        // if there is a rule that matches the url
                        //                    clients.matchAll().then(result=>{
                        //                        debugger;
                        //                        result.forEach(cur=>{
                        //                            debugger;
                        //                            cur.postMessage('EVENTO RESPONDIDO!!');
                        //                        });
                        //                    });
                        return DSWManager.respondItWith(event,
                        // we apply the right strategy for the matching rule
                        _strategies2.default[matchingRule.rule.strategy](matchingRule.rule, event.request, event, matchingRule.matching));
                    }

                    // if no rule is applied, we will request it
                    // this is the function to deal with the resolt of this request
                    var defaultTreatment = function defaultTreatment(response) {
                        if (response && (response.type == 'opaque' || response.status == 200)) {
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

        self.addEventListener('activate', function (event) {
            event.waitUntil(function (_) {
                var promises = [];
                if (PWASettings.applyImmediately) {
                    promises.push(self.clients.claim());
                }
                promises.push(_cacheManager2.default.deleteUnusedCaches(PWASettings.keepUnusedCaches));
                return Promise.all(promises);
            });
        });

        self.addEventListener('install', function (event) {
            // undoing some bad named properties :/
            PWASettings.dswRules = PWASettings.rules || PWASettings.dswRules || {};
            PWASettings.dswVersion = PWASettings.version || PWASettings.dswVersion || '1';

            if (PWASettings.applyImmediately) {
                event.waitUntil(self.skipWaiting().then(function (_) {
                    return DSWManager.setup(PWASettings);
                }));
            } else {
                event.waitUntil(DSWManager.setup(PWASettings));
            }
        });

        var comm = null;
        self.addEventListener('message', function (event) {
            // TODO: add support to message event
            var ports = event.ports;

            if (event.data.trackPath) {
                var tp = event.data.trackPath;
                DSWManager.tracking[tp] = {
                    rx: new RegExp(tp, 'i'),
                    ports: ports
                };
                return;
            }
            if (event.data === COMM_HAND_SHAKE) {
                _logger2.default.info('Commander Handshake enabled');
                comm = event.ports[0];
                setTimeout(function (_) {
                    comm.postMessage('thanks');
                }, 2000);
                //comm.postMessage('thanks');
            }
        });

        self.addEventListener('push', function (event) {
            console.log('Push message', event);

            var title = 'Push message';

            event.waitUntil(self.registration.showNotification(title, {
                'body': 'The Message',
                'icon': 'images/icon.png'
            }));
        });

        // When user clicks/touches the notification, we shall close it and open
        // or focus the web page
        self.addEventListener('notificationclick', function (event) {
            console.log('Notification click: tag', event.notification.tag);
            event.notification.close();

            var url = 'TODO';

            event.waitUntil(
            // let's look for all windows(or frames) that are using our sw
            clients.matchAll({
                type: 'window'
            }).then(function (windowClients) {
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
            }));
        });

        self.addEventListener('sync', function (event) {
            // TODO: add support to sync event
            //debugger;
        });

        DSWManager.startListening();
    })();
} else {
    (function () {

        window.addEventListener('message', function (event) {
            //        debugger;
            console.log(event, 'CHEGOU ALGO');
        });

        var comm = {
            setup: function setup() {
                if (comm.channel) {
                    return navigator.serviceWorker.controller;
                }

                // during setup, we will stablish the communication between
                // service worker and client scopes
                var messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = function (event) {
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
            messageChannel.port1.onmessage = function (event) {
                debugger;
                //                if (event.data.error) {
                //                    reject(event.data.error);
                //                } else {
                //                    resolve(event.data);
                //                }
            };
            navigator.serviceWorker.controller.postMessage({ trackPath: matchingRequest }, [messageChannel.port2]);
        };

        DSW.sendMessage = function (message) {
            //if (comm.channel && comm.channel.port2 && navigator.serviceWorker) {
            //navigator.serviceWorker.controller.postMessage(message, [comm.channel.port2]);
            //}
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
        DSW.offline = function (_) {
            return !navigator.onLine;
        };
        DSW.online = function (_) {
            return navigator.onLine;
        };

        DSW.enableNotifications = function (_) {
            return new Promise(function (resolve, reject) {
                if (navigator.onLine) {
                    navigator.serviceWorker.ready.then(function (reg) {
                        var req = reg.pushManager.subscribe({
                            userVisibleOnly: true
                        });
                        return req.then(function (sub) {
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
            var title = arguments.length <= 0 || arguments[0] === undefined ? 'Untitled' : arguments[0];
            var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

            return new Promise(function (resolve, reject) {
                DSW.enableNotifications().then(function (_) {
                    var opts = {
                        body: options.body || '',
                        icon: options.icon || false
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

        DSW.setup = function (config) {
            return new Promise(function (resolve, reject) {
                // opening on a page scope...let's install the worker
                if (navigator.serviceWorker) {
                    if (!navigator.serviceWorker.controller) {
                        // we will use the same script, already loaded, for our service worker
                        var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
                        navigator.serviceWorker.register(src).then(function (SW) {
                            _logger2.default.info('Registered service worker');

                            // setting up notifications
                            if (PWASettings.notification && PWASettings.notification.auto) {
                                navigator.serviceWorker.ready.then(function (reg) {
                                    reg.pushManager.subscribe({
                                        userVisibleOnly: true
                                    }).then(function (sub) {
                                        _logger2.default.info('Subscribed to notification server:', sub.endpoint);
                                    });
                                });
                            }

                            if (config && config.sync) {
                                if ('SyncManager' in window) {
                                    navigator.serviceWorker.ready.then(function (reg) {
                                        comm.setup();
                                        return reg.sync.register('syncr');
                                    }).then(function (_) {
                                        resolve({
                                            status: true,
                                            sync: true,
                                            sw: true
                                        });
                                    }).catch(function (err) {
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
                        }).catch(function (err) {
                            reject({
                                status: false,
                                sync: false,
                                sw: false,
                                message: 'Failed registering service worker',
                                error: err
                            });
                        });
                    }
                    navigator.serviceWorker.ready.then(function (reg) {
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
    })();
}

exports.default = DSW;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./best-matching-rx.js":1,"./cache-manager.js":2,"./go-fetch.js":3,"./logger.js":5,"./strategies.js":7}],7:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _logger = require('./logger.js');

var _logger2 = _interopRequireDefault(_logger);

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
        _logger2.default.info('offline first: Looking into cache for\n', request.url);
        return cacheManager.get(rule, request, event, matching);
    },
    'online-first': function onlineFirstStrategy(rule, request, event, matching) {
        // Will fetch it, and if there is a problem
        // will look for it in cache
        function treatIt(response) {
            if (response.status == 200) {
                if (rule.action.cache) {
                    // we will update the cache, in background
                    cacheManager.put(rule, request, response).then(function (_) {
                        _logger2.default.info('Updated in cache: ', request.url);
                    });
                }
                _logger2.default.info('From network: ', request.url);
                return response;
            }
            return cacheManager.get(rule, request, event, matching).then(function (result) {
                // if failed to fetch and was not in cache, we look
                // for a fallback response
                var pathName = new URL(event.request.url).pathname;
                if (result) {
                    _logger2.default.info('From cache(after network failure): ', request.url);
                }
                return result || DSWManager.treatBadPage(response, pathName, event);
            });
        }
        return goFetch(rule, request, event, matching).then(treatIt).catch(treatIt);
    },
    'fastest': function fastestStrategy(rule, request, event, matching) {
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
                if (response.status == 200) {
                    // if we managed to load it from network and it has
                    // cache in its actions, we cache it
                    if (rule.action.cache) {
                        // we will update the cache, in background
                        cacheManager.put(rule, request, response).then(function (_) {
                            _logger2.default.info('Updated in cache (from fastest): ', request.url);
                        });
                    }
                }

                // if cache has not resolved it yet
                if (!cacheTreated) {
                    // if it downloaded well, we use it (probably the first access)
                    if (response.status == 200) {
                        _logger2.default.log('fastest strategy: loaded from network', request.url);
                        networkTreated = true;
                        // if cache could not resolve it, the network resolves
                        resolve(response);
                    } else {
                        // if it failed, we will try and respond with
                        // something else
                        networkFailed = true;
                        treatCatch(response);
                    }
                }
            }

            function treatCache(result) {
                // if it was in cache, and network hasn't resolved previously
                if (result && !networkTreated) {
                    cacheTreated = true; // this will prevent network from resolving too
                    _logger2.default.log('fastest strategy: loaded from cache', request.url);
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
                    resolve(DSWManager.treatBadPage(response, pathName, event));
                }
                // otherwise, we still got a chance on having a result from
                // one of the sources (network or cache), and keep waiting for it
            }

            // one promise go for the network
            goFetch(rule, request.clone(), event, matching).then(treatFetch).catch(treatCatch);
            // the other, for the cache
            cacheManager.get(rule, request.clone(), event, matching).then(treatCache).catch(treatCatch);
        });
    }
};

exports.default = strategies;

},{"./logger.js":5}],8:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var utils = {
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

        return new Request(request.url || request, reqConfig);
    }
};

exports.default = utils;

},{}]},{},[6]);
