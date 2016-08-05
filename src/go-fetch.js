const mountCacheControl= rule=>{
    if (!rule.action.cache) {
        return 'no-store,no-cache';
    }
    
    let cache = 'no-cache'; // we want it to at least revalidate
    let duration = rule.action.cache.duration || -1;
    
    if (typeof duration == 'string') {
        // let's use a formated string to know the expiration time
        const sizes = {
            s: 1,
            m: 60,
            h: 3600,
            d: 86400,
            w: 604800,
            M: 2592000,
            Y: 31449600
        };
        
        let size = duration.slice(-1),
            val = duration.slice(0, -1);
        if (sizes[size]) {
            duration = 'max-age=' + val * sizes[size];
        } else {
            console.warn('Invalid duration ' + duration, rule);
            duration = '';
        }
    } else {
        if (duration === -1) {
            duration = '';
        }
    }
    return cache + ' ' + duration;
};

function goFetch (rule, request, event, matching) {
    let tmpUrl = rule? (rule.action.fetch || rule.action.redirect) : (request.url || request);
    
    // if there are group variables in the matching expression
    if (matching && matching.length > 2 && tmpUrl) {
        // we apply the variables
        matching.forEach(function(cur, idx){
            tmpUrl = tmpUrl.replace(new RegExp('\\$' + idx, 'i'), cur);
        });
    }
    
    // if no rule is passed
    if (request && !rule) {
        // we will just create a simple request to be used "anywhere"
        return new Request(tmpUrl, {
            method: request.method || 'GET',
            headers: request.headers || {},
            mode: 'cors',
            cache: 'default',
            redirect: 'manual'
        });
    }
    
    let actionType = Object.keys(rule.action)[0];
    let opts = rule.options || {};
    opts.headers = opts.headers || new Headers();
    
    // if the cache options is false, we force it not to be cached
    if(rule.action.cache === false){
        opts.headers.append('pragma', 'no-cache');
        opts.headers.append('cache-control', 'no-store,no-cache');
        tmpUrl = tmpUrl + (tmpUrl.indexOf('?') > 0 ? '&' : '?') + (new Date).getTime();
    } else {
        opts.headers.append('cache-control', mountCacheControl(rule));
    }
    
    // we will create a new request to be used, based on what has been
    // defined by the rule or current request
    request = new Request(tmpUrl || request.url, {
        method: opts.method || request.method,
        headers: opts || request.headers,
        mode: actionType == 'redirect'? 'same-origin' : 'cors',
        credentials: request.credentials,
        redirect: actionType == 'redirect'? 'manual' : request.redirect
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

export default goFetch;
