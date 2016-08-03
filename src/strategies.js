
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
            cachePromise = null;
        function treatFetch (response) {
            let result = null;
            if (response.status == 200) {
                // if we managed to load it from network and it has
                // cache in its actions, we cache it
                if (rule.action.cache) {
                    // we will update the cache, in background
                    cacheManager.put(rule, request, response).then(_=>{
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
            if(typeof cachePromise == 'function') {
                // we stop it, the request has returned
                setTimeout(cachePromise, 10);
            }
            return result;
        }

        function treatCache (result) {
            // if it was in cache, we use it...period.
            return result || new Promise((resolve, reject)=>{
                // we will wait for the request to end
                cachePromise = resolve;
            });
        }

        return Promise.race([
            goFetch(rule, request, event, matching)
                .then(treatFetch)
                .catch(treatFetch),
            cacheManager.get(rule, request, event, matching)
                .then(treatCache)
        ]);
    }
};

export default strategies;