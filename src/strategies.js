
let DSWManager;
let cacheManager;
let goFetch;

const strategies = {
    setup: function (dswM, cacheM, gf) {
        DSWManager = dswM;
        cacheManager = cacheM;
        goFetch = gf;
    },
    'offline-first': function offlineFirstStrategy (rule, request, event, matching) {
        // Will look for the content in cache
        // if it is not there, will fetch it,
        // store it in the cache
        // and then return it to be used
        console.info('offline first: Looking into cache for\n', request.url);
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
            return cacheManager.get(rule, request, event, matching)
                .then(result=>{
                    // if failed to fetch and was not in cache, we look
                    // for a fallback response
                    const pathName = (new URL(event.request.url)).pathname;
                    if(result){
                        console.info('From cache(after network failure): ', request.url);
                    }
                    return result || DSWManager.treatBadPage(response, pathName, event);
                });
        }
        return goFetch(rule, request, event, matching).then(treatIt).catch(treatIt);
    },
    'fastest': function fastestStrategy (rule, request, event, matching) {
        // Will fetch AND look in the cache.
        // The cached data will be returned faster
        // but once the fetch request returns, it updates
        // what is in the cache (keeping it up to date)
        const pathName = (new URL(event.request.url)).pathname;
        let treated = false,
            resolved = null;
        function treatFetch (response) {
            let result = null;
            
            if (response.status == 200) {
                // if we managed to load it from network and it has
                // cache in its actions, we cache it
                if (rule.action.cache) {
                    // we will update the cache, in background
                    cacheManager.put(rule, request, response).then(_=>{
                        console.info('Updated in cache (from fastest): ', request.url);
                    });
                }
            }
            
            // if cache has not resolved it yet
            if (!resolved) {
                // if it downloaded well, we use it (probably the first access)
                if (response.status == 200) {
                    console.log('fastest strategy: loaded from network', request.url);
                    resolved = true;
                    result = response;
                } else {
                    // if it failed, we will try and respond with
                    // something else
                    result = DSWManager.treatBadPage(response, pathName, event);
                }
                return result;
            }
        }

        function treatCache (result) {
            
            if (result && !resolved) {
                // if it was in cache, we use it...period.
                resolved = true;
                console.log('fastest strategy: loaded from cache', request.url);
                return result;
            }
            // if it was not in cache, we will wait a little bit, and then kill it
            return new Promise((resolve, reject)=>{
                // we will wait for the request to end
                setTimeout(resolve, 5000);
            });
        }

        return Promise.race([
            // one promise go for the network
            goFetch(rule, request, event, matching)
                .then(treatFetch)
                .catch(treatFetch),
            // the other, for the cache
            cacheManager.get(rule, request, event, matching)
                .then(treatCache)
            // 3, 2, 1...GO!
        ]);
    }
};

export default strategies;