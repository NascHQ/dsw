const PWASettings = {
    "dswVersion": 2.2,
    "applyImmediately": true,
    "appShell": [
        '/helmet.png'
    ],
    "enforceSSL": false,
    "requestTimeLimit": 6000,
    "keepUnusedCaches": false,
    "dswRules": {
        "moved-pages": {
            "match": { "path": "\/old-site\/(.*)" },
            "apply": {
                "redirect": "/redirected.html?$1"
            }
        },
        "imageNotFound": {
            "match": {
                "status": [404, 500],
                "extension": ["jpg", "gif", "png", "jpeg", "webp"]
            },
            "apply": {
                "fetch": "/images/public/404.jpg"
            }
        },
        "redirectOlderPage": {
            "match": {
                "path": "\/legacy-images\/.*"
            },
            "apply": {
                "fetch": "/images/public/gizmo.jpg"
            }
        },
        "pageNotFound": {
            "match": {
                "status": [404]
            },
            "apply": {
                "fetch": "/404.html"
            }
        },
        "imageNotCached": {
            "match": { "path": "\/images\/not-cached" },
            "apply": {
                "cache": false
            }
        },
        "images": {
            "match": { "extension": ["jpg", "gif", "png", "jpeg", "webp"] },
            "apply": {
                "cache": {
                    "name": "cachedImages",
                    "version": "1"
                }
            }
        },
        "statics": {
            "match": { "extension": ["js", "css"] },
            "apply": {
                "cache": {
                    "name": "static-files",
                    "version": "2"
                }
            }
        },
        "static-html": {
            "match": [
                { "extension": ["html"] },
                { "path": "\/$" }
            ],
            "strategy": "online-first",
            "apply": {
                "cache": {
                    "name": "static-html-files",
                    "version": "1"
                }
            }
        },
        "userData": {
            "match": { "path": "\/api\/user\/.*" },
            "options": { "credentials": "same-origin"},
            "strategy": "fastest",
            "apply": {
                "indexedDB": {
                    "name": "userData",
                    "version": "2",
                    "indexes": ["name"]
                }
            }
        },
        "service": {
            "match": { "path": "\/api\/service\/.*" },
            "options": { "credentials": "same-origin"},
            "strategy": "fastest",
            "apply": {
                "indexedDB": {
                    "name": "serviceData",
                    "version": "1",
                    "indexes": ["id"]
                }
            }
        }
    }
}
;
(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
function getBestMatchingRX(str) {
    var bestMatchingRX = void 0;
    var bestMatchingGroup = Number.MAX_SAFE_INTEGER;
    var rx = []; // list of regular expressions
    rx.forEach(function (currentRX) {
        var regex = new RegExp(currentRX);
        var groups = regex.exec(str);
        if (groups && groups.length < bestMatchingGroup) {
            bestMatchingRX = currentRX;
            bestMatchingGroup = groups.length;
        }
        console.log(groups);
    });
    return bestMatchingRX;
}

exports.default = getBestMatchingRX;

},{}],2:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _indexeddbManager = require('./indexeddb-manager.js');

var _indexeddbManager2 = _interopRequireDefault(_indexeddbManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var DEFAULT_CACHE_NAME = 'defaultDSWCached';
var DEFAULT_CACHE_VERSION = null;

var DSWManager = void 0,
    PWASettings = void 0;

// finds the real size of an utf-8 string
function lengthInUtf8Bytes(str) {
    // Matches only the 10.. bytes that are non-initial characters in a multi-byte sequence.
    var m = encodeURIComponent(str).match(/%[89ABab]/g);
    return str.length + (m ? m.length : 0);
}

var cacheManager = {
    setup: function setup(DSWMan, PWASet) {
        PWASettings = PWASet;
        DSWManager = DSWMan;
        DEFAULT_CACHE_VERSION = PWASettings.dswVersion || '1';
        _indexeddbManager2.default.setup(cacheManager);
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
        var cacheConf = rule.action.cache;
        if (cacheConf) {
            return (cacheConf.name || DEFAULT_CACHE_NAME) + '::' + (cacheConf.version || DEFAULT_CACHE_VERSION);
        }
        return DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION;
    },
    register: function register(rule) {
        cacheManager.registeredCaches.push(cacheManager.mountCacheId(rule));
    },
    put: function put(rule, request, response) {
        var cloned = response.clone();
        return caches.open(cacheManager.mountCacheId(rule)).then(function (cache) {
            cache.put(request, cloned);
            return response;
        });
    },
    add: function add(req) {
        var cacheId = arguments.length <= 1 || arguments[1] === undefined ? DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION : arguments[1];

        return new Promise(function (resolve, reject) {
            caches.open(cacheId).then(function (cache) {
                cache.add(req);
                resolve();
            }).catch(function (err) {
                console.error(err);
                resolve();
            });
        });
    },
    get: function get(rule, request, event, matching) {
        var actionType = Object.keys(rule.action)[0],
            url = request.url || request,
            pathName = new URL(url).pathname;

        if (pathName == '/' || pathName.match(/^\/index\.([a-z0-9]+)/i)) {
            // requisitions to / should 
            actionType = 'cache';
        }

        var opts = rule.options || {};
        opts.headers = opts.headers || new Headers();

        // if the cache options is false, we force it not to be cached
        if (rule.action.cache === false) {
            opts.headers.append('pragma', 'no-cache');
            opts.headers.append('cache-control', 'no-cache');
            url = request.url + (request.url.indexOf('?') > 0 ? '&' : '?') + new Date().getTime();
            pathName = new URL(url).pathname;
            request = new Request(url);
        }

        switch (actionType) {
            case 'idb':
            case 'IDB':
            case 'indexedDB':
                {
                    return new Promise(function (resolve, reject) {
                        // function to be used after fetching
                        function treatFetch(response) {
                            if (response && response.status == 200) {
                                var done = function done(_) {
                                    resolve(response);
                                };

                                // store it in the indexedDB
                                _indexeddbManager2.default.save(rule.name, response.clone()).then(done).catch(done); // if failed saving, we still have the reponse to deliver
                            } else {
                                    debugger;
                                    // TODO: treat the not found requests
                                }
                        }

                        _indexeddbManager2.default.get(rule.name, request).then(function (result) {
                            debugger;
                            // if we did have it in the indexedDB
                            if (result) {
                                // we use it
                                console.log('found something');
                                // TODO: use it
                            } else {
                                // if it was not stored, let's fetch it
                                // fetching
                                request = DSWManager.createRequest(request);
                                result = fetch(request, opts).then(treatFetch).catch(treatFetch);
                            }
                        });
                    });
                }
            case 'redirect':
            case 'fetch':
                {
                    (function () {
                        var tmpUrl = rule.action.fetch || rule.action.redirect;

                        if (matching.length > 2) {
                            // applying variables
                            matching.forEach(function (cur, idx) {
                                tmpUrl = tmpUrl.replace(new RegExp('\\$' + idx, 'i'), cur);
                            });
                        }

                        request = new Request(tmpUrl, {
                            method: opts.method || request.method,
                            headers: opts || request.headers,
                            mode: 'same-origin', // need to set this properly
                            credentials: request.credentials,
                            redirect: 'manual' // let browser handle redirects
                        });

                        url = request.url;
                        pathName = new URL(url).pathname;
                        // keep going to be treated with the cache case
                    })();
                }
            case 'cache':
                {
                    var _ret2 = function () {

                        var cacheId = void 0;

                        if (rule.action.cache) {
                            cacheId = cacheManager.mountCacheId(rule);
                        }

                        // TODO: use goFetch instead of fetch and creating new requests
                        return {
                            v: caches.match(request).then(function (result) {

                                // if it does not exist (cache could not be verified)
                                if (result && result.status != 200) {
                                    (DSWManager.rules[result.status] || []).some(function (cur, idx) {
                                        if (pathName.match(cur.rx)) {
                                            if (cur.action.fetch) {
                                                // not found requests should
                                                // fetch a different resource
                                                result = fetch(cur.action.fetch, cur.action.options);
                                                return true; // stopping the loop
                                            }
                                        }
                                    });
                                    return result;
                                } else {
                                    var treatFetch = function treatFetch(response) {
                                        if (!response.status) {
                                            response.status = 404;
                                        }
                                        // after retrieving it, we cache it
                                        // if it was ok
                                        if (response.status == 200) {
                                            // if cache is not false, it will be added to cache
                                            if (rule.action.cache !== false) {
                                                return caches.open(cacheId).then(function (cache) {
                                                    cache.put(request, response.clone());
                                                    console.log('[ dsw ] :: Result was not in cache, was loaded and added to cache now', url);
                                                    return response;
                                                });
                                            } else {
                                                return response;
                                            }
                                        } else {
                                            // otherwise...let's see if there is a fallback
                                            // for the 404 requisition
                                            return DSWManager.treatBadPage(response, pathName, event);
                                        }
                                    };

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
                                        var req = new Request(request.url, {
                                            method: opts.method || request.method,
                                            headers: opts || request.headers,
                                            mode: 'same-origin', // need to set this properly
                                            credentials: request.credentials,
                                            redirect: 'manual' // let browser handle redirects
                                        });

                                        return fetch(req, opts).then(treatFetch).catch(treatFetch);
                                    }
                                }
                            })
                        };
                    }();

                    if ((typeof _ret2 === 'undefined' ? 'undefined' : _typeof(_ret2)) === "object") return _ret2.v;
                }
            default:
                {
                    // also used in fetch actions
                    return fetch(url);
                }
        }
    }
};

exports.default = cacheManager;

},{"./indexeddb-manager.js":4}],3:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

function goFetch(rule, request, event, matching) {

    // if only request is passed
    if (request && !rule && !event) {
        // we will just create a simple request to be used "anywhere"
        return new Request(request.url || request, {
            method: request.method || 'GET',
            headers: request.headers || {},
            mode: 'cors',
            cache: 'default'
        });
    }

    var actionType = Object.keys(rule.action)[0],
        tmpUrl = rule.action.fetch || rule.action.redirect;

    var opts = rule.options || {};
    opts.headers = opts.headers || new Headers();

    // if there are group variables in the matching expression
    if (matching.length > 2 && tmpUrl) {
        // we apply the variables
        matching.forEach(function (cur, idx) {
            tmpUrl = tmpUrl.replace(new RegExp('\\$' + idx, 'i'), cur);
        });
    }

    // in case there is a tmpUrl
    // it means it is a redirect or fetch action
    if (tmpUrl) {
        // and we will use it to replace the current request

        // if the cache options is false, we force it not to be cached
        if (rule.action.cache === false) {
            opts.headers.append('pragma', 'no-cache');
            opts.headers.append('cache-control', 'no-cache');
            tmpUrl = tmpUrl + (tmpUrl.indexOf('?') > 0 ? '&' : '?') + new Date().getTime();
        }
    }

    // we will create a new request to be used, based on what has been
    // defined by the rule or current request
    request = new Request(tmpUrl || request.url, {
        method: opts.method || request.method,
        headers: opts || request.headers,
        mode: actionType == 'redirect' ? 'same-origin' : 'cors',
        credentials: request.credentials,
        redirect: actionType == 'redirect' ? 'manual' : request.redirect
    });

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

},{}],4:[function(require,module,exports){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var DEFAULT_DB_NAME = 'defaultDSWDB';
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
                    console.log('There is a new version of the database(IndexedDB) for ' + config.name);
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

                if (config.indexes) {
                    baseData.keyPath = config.indexes;
                }
                if (!config.indexes || config.autoIncrement) {
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
                    // if it is the first time it is creating it
                    db.createObjectStore(config.name, baseData);
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
            // TODO: look for cached keys, then find them in the db
            caches.match(request).then(function (result) {});
            resolve();
        });
    },
    save: function save(dbName, data) {
        return new Promise(function (resolve, reject) {

            data.json().then(function (obj) {

                var store = getObjectStore(dbName),
                    req = void 0;

                req = store.add(obj);

                req.onsuccess = function () {
                    resolve();
                };
                req.onerror = function (event) {
                    reject('Failed saving to the indexedDB!', this.error);
                };
            }).catch(function (err) {
                console.error('Failed saving into indexedDB!\n', err.message, err);
                reject('Failed saving into indexedDB!');
            });

            console.log(dbName, data);
        });
    }
};

exports.default = indexedDBManager;

},{}],5:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _bestMatchingRx = require('./best-matching-rx.js');

var _bestMatchingRx2 = _interopRequireDefault(_bestMatchingRx);

var _cacheManager = require('./cache-manager.js');

var _cacheManager2 = _interopRequireDefault(_cacheManager);

var _goFetch = require('./go-fetch.js');

var _goFetch2 = _interopRequireDefault(_goFetch);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

var DSW = {};
var REQUEST_TIME_LIMIT = 5000;

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
            rules: {},
            strategies: {
                'offline-first': function offlineFirstStrategy(rule, request, event, matching) {
                    // Will look for the content in cache
                    // if it is not there, will fetch it,
                    // store it in the cache
                    // and then return it to be used
                    console.info('offline first: Looking into cache for\n', request.url);
                    return _cacheManager2.default.get(rule, request, event, matching);
                },
                'online-first': function onlineFirstStrategy(rule, request, event, matching) {
                    // Will fetch it, and if there is a problem
                    // will look for it in cache
                    function treatIt(response) {
                        if (response.status == 200) {
                            if (rule.action.cache) {
                                // we will update the cache, in background
                                _cacheManager2.default.put(rule, request, response).then(function (_) {
                                    console.info('Updated in cache: ', request.url);
                                });
                            }
                            console.info('From network: ', request.url);
                            return response;
                        }
                        return _cacheManager2.default.get(rule, request, event, matching).then(function (result) {
                            // if failed to fetch and was not in cache, we look
                            // for a fallback response
                            var pathName = new URL(event.request.url).pathname;
                            if (result) {
                                console.info('From cache(after network failure): ', request.url);
                            }
                            return result || DSWManager.treatBadPage(response, pathName, event);
                        });
                    }
                    return (0, _goFetch2.default)(rule, request, event, matching).then(treatIt).catch(treatIt);
                },
                'fastest': function fastestStrategy(rule, request, event, matching) {
                    // Will fetch AND look in the cache.
                    // The cached data will be returned faster
                    // but once the fetch request returns, it updates
                    // what is in the cache (keeping it up to date)
                    var pathName = new URL(event.request.url).pathname;
                    var treated = false,
                        cachePromise = null;
                    function treatFetch(response) {
                        var result = null;
                        if (response.status == 200) {
                            // if we managed to load it from network and it has
                            // cache in its actions, we cache it
                            if (rule.action.cache) {
                                // we will update the cache, in background
                                _cacheManager2.default.put(rule, request, response).then(function (_) {
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
                        if (typeof cachePromise == 'function') {
                            // we stop it, the request has returned
                            setTimeout(cachePromise, 10);
                        }
                        return result;
                    }

                    function treatCache(result) {
                        // if it was in cache, we use it...period.
                        return result || new Promise(function (resolve, reject) {
                            // we will wait for the request to end
                            cachePromise = resolve;
                        });
                    }

                    return Promise.race([(0, _goFetch2.default)(rule, request, event, matching).then(treatFetch).catch(treatFetch), _cacheManager2.default.get(rule, request, event, matching).then(treatCache)]);
                }
            },
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
                            console.info('Found fallback rule for ', pathName, '\nLooking for its result');
                            result = _cacheManager2.default.get(cur, new Request(cur.action.fetch), event, matching);
                            return true; // stopping the loop
                        }
                    }
                });
                if (!result) {
                    console.info('No rules for failed request: ', pathName, '\nWill output the failure');
                }
                return result || response;
            },
            setup: function setup(dswConfig) {
                var _this = this;

                _cacheManager2.default.setup(DSWManager, PWASettings);
                return new Promise(function (resolve, reject) {
                    // we will prepare and store the rules here, so it becomes
                    // easier to deal with, latelly on each requisition
                    var preCache = PWASettings.appShell || [],
                        dbs = [];

                    Object.keys(dswConfig.dswRules).forEach(function (heuristic) {
                        var ruleName = heuristic;
                        heuristic = dswConfig.dswRules[heuristic];
                        heuristic.name = ruleName;

                        var appl = heuristic['apply'],
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
                            path = (path.join('|') || '([.+]?)') + '|';
                        } else {
                            // "match" may be an object, then we simply use it
                            path = (heuristic.match.path || '') + '([.+]?)';
                            extensions = heuristic.match.extension, status = heuristic.match.status;
                        }

                        // preparing extentions to be added to the regexp
                        var ending = '([\/\&\?]|$)';
                        if (Array.isArray(extensions)) {
                            extensions = '(' + extensions.join(ending + '|') + ending + ')';
                        } else if (typeof extensions == 'string') {
                            extensions = '(' + extensions + ending + ')';
                        } else {
                            extensions = '.+';
                        }

                        // and now we "build" the regular expression itself!
                        var rx = new RegExp(path + '((\\.)((' + extensions + ')([\\?\&\/].+)?))', 'i');

                        // if it fetches something, and this something is not dynamic
                        // also, if it will redirect to some static url
                        var noVars = /\$[0-9]+/;
                        if (appl.fetch && !appl.fetch.match(noVars) || appl.redirect && !appl.redirect.match(noVars)) {
                            preCache.push(appl.fetch || appl.redirect);
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
                            return _cacheManager2.default.add(cur);
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
            createRequest: function createRequest(request) {
                return (0, _goFetch2.default)(null, request.url || request);
            },
            startListening: function startListening() {
                // and from now on, we listen for any request and treat it
                self.addEventListener('fetch', function (event) {

                    var url = new URL(event.request.url);
                    var pathName = url.pathname;

                    // in case we want to enforce https
                    if (PWASettings.enforceSSL) {
                        if (url.protocol != 'https:' && url.hostname != 'localhost') {
                            return event.respondWith(Response.redirect(event.request.url.replace('http:', 'https:'), 302));
                        }
                    }

                    var i = 0,
                        l = (DSWManager.rules['*'] || []).length;

                    for (; i < l; i++) {
                        var rule = DSWManager.rules['*'][i];
                        var matching = pathName.match(rule.rx);
                        if (matching) {
                            // if there is a rule that matches the url
                            return event.respondWith(DSWManager.strategies[rule.strategy](rule, event.request, event, matching));
                        }
                    }
                    // if no rule is applied, we simple request it
                    var defaultTreatment = function defaultTreatment(response) {
                        if (response && response.status == 200) {
                            return response;
                        } else {
                            return DSWManager.treatBadPage(response, pathName, event);
                        }
                    };

                    // if no rule matched, we simple respond the event with a fetch
                    return event.respondWith((0, _goFetch2.default)(null, event.request)
                    // but we will still treat the error pages
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
            // TODO: maybe remove older cache, here?
            if (PWASettings.applyImmediately) {
                event.waitUntil(self.skipWaiting().then(function (_) {
                    return DSWManager.setup(PWASettings);
                }));
            } else {
                event.waitUntil(DSWManager.setup(PWASettings));
            }
        });

        self.addEventListener('message', function (event) {
            // TODO: add support to message event
        });

        self.addEventListener('sync', function (event) {
            // TODO: add support to sync event
        });

        DSWManager.startListening();
    })();
} else {
    DSW.setup = function (config) {
        return new Promise(function (resolve, reject) {
            // opening on a page scope...let's install the worker
            if (navigator.serviceWorker) {
                if (!navigator.serviceWorker.controller) {
                    // we will use the same script, already loaded, for our service worker
                    var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
                    navigator.serviceWorker.register(src).then(function (SW) {
                        console.info('[ SW ] :: registered');
                        resolve(navigator.serviceWorker.ready);
                    });
                }
            } else {
                reject('Service worker not supported');
            }
        });
    };

    window.DSW = DSW;
}

exports.default = DSW;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./best-matching-rx.js":1,"./cache-manager.js":2,"./go-fetch.js":3}]},{},[5]);
