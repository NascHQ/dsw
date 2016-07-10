const PWASettings = {"dswVersion":2.3000000000000003,"applyImmediately":true,"appShell":[],"dswRules":{"moved-pages":{"match":{"path":"/old-site/(.*)"},"apply":{"redirect":"/redirected.html?$1"}},"imageNotFound":{"match":{"status":[404,500],"extension":["jpg","gif","png","jpeg","webp"]},"apply":{"fetch":"/images/public/404.jpg"}},"redirectOlderPage":{"match":{"path":"/legacy-images/.*"},"apply":{"fetch":"/images/public/gizmo.jpg"}},"pageNotFound":{"match":{"status":[404]},"apply":{"fetch":"/404.html"}},"imageNotCached":{"match":{"path":"/images/not-cached"},"apply":{"cache":false}},"images":{"match":{"extension":["jpg","gif","png","jpeg","webp"]},"apply":{"cache":{"name":"cachedImages","version":"1"}}},"statics":{"match":{"extension":["js","css"]},"apply":{"cache":{"name":"static-files","version":"1"}}},"static-html":{"match":{"extension":["html"]},"apply":{"cache":{"name":"static-html-files","version":"1"}}},"userData":{"match":{"path":"/api/user/.*"},"options":{"credentials":"same-origin"},"apply":{"indexedDB":{"name":"userData","version":"1","indexes":["name"]}}},"updates":{"match":{"path":"/api/updates/"},"keepItWarm":true,"apply":{"indexedDB":{"name":"shownUpdates","version":"1"}}},"articles":{"match":{"path":"/api/updates/"},"apply":{"cache":{"name":"cachedArticles","version":"1"}}},"events":{"match":{"path":"/api/events/"},"apply":{"indexedDB":{"name":"eventsList","version":"1"}}},"lineup":{"match":{"path":"/api/events/(.*)/"},"apply":{"indexedDB":{"name":"eventLineup-$1","version":"1"}}}}};
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

var DEFAULT_DB_NAME = 'defaultDSWDB';
var dbs = {};

function getObjectStore(dbName) {
    var mode = arguments.length <= 1 || arguments[1] === undefined ? 'readwrite' : arguments[1];

    var db = dbs[dbName],
        tx = db.transaction(dbName, mode);
    return tx.objectStore(dbName);
}

var indexedDBManager = {
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

                if (config.key) {
                    baseData.keyPath = config.key;
                }
                if (!config.key || config.autoIncrement) {
                    baseData.autoIncrement = true;
                }

                // now we create the structure
                var store = db.createObjectStore(config.name, baseData);

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
            //let store = getObjectStore(dbName);
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

},{}],3:[function(require,module,exports){
(function (global){
'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _bestMatchingRx = require('./best-matching-rx.js');

var _bestMatchingRx2 = _interopRequireDefault(_bestMatchingRx);

var _indexeddbManager = require('./indexeddb-Manager.js');

var _indexeddbManager2 = _interopRequireDefault(_indexeddbManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// TODO: requests redirected due to 404, should not cache the 404 result for itself
// TODO: should pre-cache or cache in the first load, some of the page's already sources (like css, js or images), or tell the user it supports offline usage, only in the next reload
// TODO: add support to keepItWarm: use a strategy with promise.race() to always fetch the latest data and update the cache

var isInSWScope = false;
var isInTest = typeof global.it === 'function';

var DSW = {};

// this try/catch is used simply to figure out the current scope
try {
    var SWScope = ServiceWorkerGlobalScope;
    if (self instanceof ServiceWorkerGlobalScope) {
        isInSWScope = true;
    }
} catch (e) {/* nothing...just had to find out the scope */}

if (isInSWScope) {
    (function () {
        var treatBadPage = function treatBadPage(response, pathName, event) {
            var result = void 0;
            DSWManager.rules[response.status || 404].some(function (cur, idx) {
                var matching = pathName.match(cur.rx);
                if (matching) {
                    if (cur.action.fetch) {
                        // not found requisitions should
                        // fetch a different resource
                        result = cacheManager.get(cur, new Request(cur.action.fetch), event, matching);
                        return true; // stopping the loop
                    }
                }
            });
            return result || response;
        };

        var DEFAULT_CACHE_NAME = 'defaultDSWCached';
        var DEFAULT_CACHE_VERSION = PWASettings.dswVersion || '1';

        var cacheManager = {
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
                                            // TODO: treat the not found requests
                                        }
                                }

                                _indexeddbManager2.default.get(rule.name, request).then(function (result) {
                                    // if we did have it in the indexedDB
                                    if (result) {
                                        // we use it
                                        console.log('found something');
                                        // TODO: use it
                                    } else {
                                        // if it was not stored, let's fetch it
                                        // fetching
                                        result = fetch(request, opts).then(treatFetch).catch(treatFetch);
                                    }
                                });
                                //indexedDBManager.save(rule.name, request);
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

                                request = new Request(tmpUrl);
                                url = request.url;
                                pathName = new URL(url).pathname;
                                // keep going to be treated with the cache case
                            })();
                        }
                    case 'cache':
                        {
                            var _ret3 = function () {

                                var cacheId = DEFAULT_CACHE_NAME + '::' + DEFAULT_CACHE_VERSION;

                                if (rule.action.cache) {
                                    cacheId = (rule.action.cache.name || DEFAULT_CACHE_NAME) + '::' + (rule.action.cache.version || DEFAULT_CACHE_VERSION);
                                }

                                return {
                                    v: caches.match(request).then(function (result) {

                                        // if it does not exist (cache could not be verified)
                                        if (result && result.status != 200) {
                                            DSWManager.rules[result.status].some(function (cur, idx) {
                                                if (pathName.match(cur.rx)) {
                                                    if (cur.action.fetch) {
                                                        // not found requisitions should
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
                                                return result;
                                            } else if (actionType == 'redirect') {
                                                return Response.redirect(request.url, 302);
                                                //debugger;
                                                return result;
                                                // AQUI
                                                //.then(treatFetch)
                                                //.catch(treatFetch);
                                            } else {
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

                            if ((typeof _ret3 === 'undefined' ? 'undefined' : _typeof(_ret3)) === "object") return _ret3.v;
                        }
                    default:
                        {
                            // also used in fetch actions
                            return fetch(url);
                        }
                }
            }
        };

        var DSWManager = {
            rules: {},
            addRule: function addRule(sts, rule, rx) {
                this.rules[sts] = this.rules[sts] || [];
                this.rules[sts].push({
                    name: rule.name,
                    rx: rx,
                    action: rule['apply']
                });
                return this;
            },
            setup: function setup(dswConfig) {
                var _this = this;

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
                            extensions = heuristic.match.extension,
                            status = heuristic.match.status;

                        // preparing extentions to be added to the regexp
                        if (Array.isArray(extensions)) {
                            var ending = '([\/\&\?]|$)';
                            extensions = '(' + extensions.join(ending + '|') + ending + ')';
                        } else {
                            extensions = '.+';
                        }

                        // and the path
                        var path = /* '((.+)?)' + */(heuristic.match.path || '') + '([.+]?)';

                        // and now we "build" the regular expression itself!
                        var rx = new RegExp(path + '(\\.)?((' + extensions + ')([\\?\&\/].+)?)', 'i');

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
                            _this.addRule(sts, heuristic, rx);
                        });
                    });

                    // adding the dsw itself to cache
                    _this.addRule('*', {
                        name: 'serviceWorker',
                        match: { path: /^\/dsw.js(\?=dsw-manager)?$/ },
                        'apply': { cache: { name: DEFAULT_CACHE_NAME, version: DEFAULT_CACHE_VERSION } }
                    }, location.href);

                    // addinf the root path to be also cached by default
                    var rootMatchingRX = /^(\/|\/index(\.[0-1a-z]+)?)$/;
                    _this.addRule('*', {
                        name: 'rootDir',
                        match: { path: rootMatchingRX },
                        'apply': { cache: { name: DEFAULT_CACHE_NAME, version: DEFAULT_CACHE_VERSION } }
                    }, rootMatchingRX);

                    preCache.unshift('/');

                    // if we've got urls to pre-store, let's cache them!
                    // also, if there is any database to be created, this is the time
                    if (preCache.length || dbs.length) {
                        // we fetch them now, and store it in cache
                        return Promise.all(preCache.map(function (cur) {
                            return cacheManager.add(cur);
                        }).concat(dbs.map(function (cur) {
                            return _indexeddbManager2.default.create(cur);
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
            startListening: function startListening() {
                // and from now on, we listen for any request and treat it
                self.addEventListener('fetch', function (event) {

                    var url = new URL(event.request.url);
                    var pathName = new URL(url).pathname;

                    var i = 0,
                        l = (DSWManager.rules['*'] || []).length;

                    for (; i < l; i++) {
                        var rule = DSWManager.rules['*'][i];
                        var matching = pathName.match(rule.rx);
                        if (matching) {
                            // if there is a rule that matches the url
                            return event.respondWith(cacheManager.get(rule, event.request, event, matching));
                        }
                    }
                    // if no rule is applied, we simple request it
                    var defaultTreatment = function defaultTreatment(response) {
                        if (response && response.status == 200) {
                            return response;
                        } else {
                            return treatBadPage(response, pathName, event);
                        }
                    };
                    return event.respondWith(fetch(event.request.url, {})
                    // but we will still treat the error pages
                    .then(defaultTreatment).catch(defaultTreatment));
                });
            }
        };

        self.addEventListener('activate', function (event) {
            if (PWASettings.applyImmediately) {
                event.waitUntil(self.clients.claim());
            }
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
                    navigator.serviceWorker.register(src + '?dsw-manager').then(function (SW) {
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
},{"./best-matching-rx.js":1,"./indexeddb-Manager.js":2}]},{},[3]);
