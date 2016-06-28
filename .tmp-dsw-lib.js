const PWASettings = {
    "dswVersion": "1.0",
    "dswRules": {
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
        "images": {
            "match": { "extension": ["jpg", "gif", "png", "jpeg", "webp"] },
            "apply": {
                "cache": {
                    "name": "cachedImages",
                    "version": "1",
                    "duration": "20D"
                }
            }
        },
        "userData": {
            "match": { "path": "/\/api\/user\/.*/" },
            "apply": {
                "sessionStorage": {
                    "name": "cachedUserData",
                    "version": "1",
                    "duration": "20m"
                }
            }
        },
        "updates": {
            "match": { "path": "/\/api\/updates/" },
            "apply": {
                "browserDB": {
                    "name": "shownUpdates",
                    "version": "1"
                }
            }
        },
        "articles": {
            "match": { "path": "/\/api\/updates/" },
            "apply": {
                "cache": {
                    "name": "cachedArticles",
                    "version": "1",
                    "duration": "10D"
                }
            }
        },
        "events": {
            "match": { "path": "/\/api\/events/" },
            "apply": {
                "browserDB": {
                    "name": "eventsList",
                    "version": "1"
                }
            }
        },
        "lineup": {
            "match": { "path": "/\/api\/events\/(.*)/" },
            "apply": {
                "browserDB": {
                    "name": "eventLineup-$1",
                    "version": "1"
                }
            }
        }
    }
}
;

var isInSWScope = false;

const DSW = {};

// this try/catch is used simply to figure out the current scope
try {
    let SWScope = ServiceWorkerGlobalScope;
    if(self instanceof ServiceWorkerGlobalScope){
        isInSWScope = true;
    }
}catch(e){
    // nothing...just had to find out the scope
}

if (isInSWScope) {
    
    // This is the SW file being loaded
    // let's install it and deal with all the fetch information required
    console.info('[ SW ] :: loaded...looking for the config file');
    let d = new Date();
    d = '' + d.getFullYear() + d.getMonth() + d.getDate();
    
    const cacheManager = {
        add: (req, cacheId = 'defaultDSWCached::1') => {
            return new Promise((resolve, reject)=>{
                caches.open(cacheId).then(cache => {
                    cache.add(req);
                    resolve();
                }).catch(err=>{
                    console.error(err);
                    resolve();
                });
            });
        },
        get: (rule, url)=>{
            let actionType = Object.keys(rule.action)[0];
            
            //rule.action
            
            switch (actionType) {
                // TODO: look for cached data
                default: {
                    // also used in fetch actions
                    return fetch(url);
                }
            }
        }
    };
    
    function resultOf (url, actions, event) {
        // for now, only the first action is used
        // actually, I don't see by now any reason to use more than one action
        return cacheManager.get('fetch', url.pathname || url).then(response=>{
            // let's validate the response status
            let rulesForStatus = rules[response.status] || false;
            if (rulesForStatus) {
                // in case there are rules for that status
                rulesForStatus.forEach(cur=>{
                    // we look for a match for the current path
                    // and then respond with that
                    return matchAndResolve(url, event, rulesForStatus);
                });
            }
            
            // ok, nothing else to do here
            return response;
        });
    }
    
    // we receive a set of rules and verify if any of the should apply
    function matchAndResolve (url, event, status = '*') {
        rulesSet = rules[status];
        for (let l = rulesSet.length, i = 0; i < l; i++) {
            if(url.pathname.match(rulesSet[i].rx)){
                // if one rule matched, we try to apply it looking for its result
                return resultOf(url.pathname || url, rulesSet.action, event);
            }
        }
        // in case no rule matched
        return fetch(url);
    }
    
    const DSWManager = {
        rules: {},
        addRule (sts, rule, rx) {
            this.rules[sts] = this.rules[sts] || [];
            this.rules[sts].push({
                rx,
                action: rule['apply']
            });
            return this;
        },
        setup (dswConfig) {
            return new Promise((resolve, reject)=>{
                // we will prepare and store the rules here, so it becomes
                // easier to deal with, latelly on each requisition
                let preCache = [];
                Object.keys(dswConfig.dswRules).forEach(heuristic=>{
                    heuristic = dswConfig.dswRules[heuristic];

                    let appl = heuristic['apply'],
                        extensions = heuristic.match.extension,
                        status = heuristic.match.status;

                    // preparing extentions to be added to the regexp
                    if(Array.isArray(extensions)){
                        extensions = extensions.join('|');
                    }else{
                        extensions = ".+"
                    }

                    // also preparing status to be added to the regexp
                    status = Array.isArray(status)? status : [status || '*'];

                    // and the path
                    let path = '.+' + (heuristic.match.path || '' ) + '.+';

                    // and now we "build" the regular expression itself!
                    let rx = new RegExp(path + "\\.(("+ extensions +")[\\?.*]?)", 'i');

                    // storing the new, shorter, optimized structure for the rules
                    status.forEach(sts=>{
                        if (sts == 200) {
                            sts = '*';
                        }
                        this.addRule(sts, heuristic, rx);
                    });

                    // if it fetches something, and this something is not dynamic
                    if(appl.fetch && !appl.fetch.match(/\$\{.+\}/)){
                        preCache.push(appl.fetch);
                    }
                });
                
                if(preCache.length){
                    // we fetch them now, and store it in cache
                    return Promise.all(
                        preCache.map(function(cur) {
                            return cacheManager
                                    .add(cur);
                        })
                    ).then(resolve);
                }else{
                    resolve();
                }
            });
        },
        getRulesBeforeFetching () {
            // returns all the rules for * or 200
            return this.rules['*'] || false;
        },
        lookForCachedContent (rules=[], url) {
            return new Promise((resolve, reject)=>{
                let l = rules.length,
                    i = 0;
                debugger;
                for(; i<l; i++){
                    console.log(rules[i]);
                    if(url.href.match(rules[i].rx)){
                        // if there is a rule that matches the request
                        // we look for its content in some of the caches
                        return cacheManager.get(rules[i], url);
                    }
                }
                resolve();
            });
        },
        startListening () {
            // and from now on, we listen for any request and treat it
            self.addEventListener('fetch', event=>{
                debugger;
                
                const url = new URL(event.request.url);
                console.log('FETCHING: ', event.request.url);

                // for all the rules in * or 200
                // we:
                // (before fetching it)
                // 1) verify if the rule matches with the url
                // 1.1) if TRUE
                // 1.2) apply the rule:
                // 1.2.1) if any kind of cache
                // 1.2.1.1) look for it in the cache
                // 1.2.1.2) if it is in the cache
                // 1.2.1.2.1) returns it
                // 1.2.1.2) if it is not in the cache
                // 1.2.1.2.2) fetch it
                // 1.2.1.3) if it is fetch
                // 1.2.1.3.1) fetch it
                // 1.1) if FALSE
                // 1.3) fetch it
                // (after fetching it)
                // 2) verify if there are rules for the status
                // 2.1) if TRUE
                // 2.1.1) apply the rule:
                // 2.1.1.1) if any kind of cache (and status is 200)
                // 2.1.1.1.1) store the result in cache
                // 2.1.2) return the response itself
                // 2.1.) 
                // 2.2) if FALSE
                // 2.3) return the response itself
                // 

                let rulesBeforeFetching = this.getRulesBeforeFetching();
                if (rulesBeforeFetching) {
                    this.lookForCachedContent(rulesBeforeFetching, url)
                        .then(result=>{
                            if (result) {
                                // found in a cache
                                return event.respondWith(result);
                            }
                            // not cached yet, go for it, boy!
                            return event.respondWith(fetch(url));
                        });
                }
                return event.respondWith(fetch(url))
//                return matchAndResolve(url, event).then(result=>{
//                    debugger;
//                    event.respondWith(result);
//                });
            });
        }
    };

    self.addEventListener('activate', function(event) {
        // TODO: remove older cache, here
        debugger;
        DSWManager.startListening();
    });
    self.addEventListener('install', function(event) {
        debugger;
        event.waitUntil(DSWManager.setup(PWASettings));
            //.then(DSWManager.startListening);
    });
    self.addEventListener('message', function(event) {
        // TODO: add support to message event
        //debugger;
    });
    self.addEventListener('sync', function(event) {
        // TODO: add support to sync event
        //debugger;
    });
        
//    fetch('/dswfile.json?' + d) // caching for about a day
//        .then(result=>{
//            result.text()
//                .then(dswConfig=>{
//                    dswConfig = dswConfig.replace(/\\-/g, '-');
//                    
//                    debugger;
//                    dswConfig = JSON.parse(dswConfig);
//    DSWManager.setup(PWASettings)
//        .then(DSWManager.startListening);
    //debugger;
    DSWManager.startListening();
//                });
//        })
//        .catch(err=>{
//            console.error('You need to create a dswfile.js in the root directory.\nIt could not be found!');
//        });
}else{
    DSW.setup = config => {
        // opening on a page scope...let's install the worker
        if(navigator.serviceWorker){
            // we will use the same script, already loaded, for our service worker
            var src = document.querySelector('script[src$="dsw.js"]').getAttribute('src');
            navigator.serviceWorker
                .register(src, { data: { foo: "bar", baz: 123 } })
                .then(SW=>{
                    console.info('[ SW ] :: registered');
                });
        }
    };
}
