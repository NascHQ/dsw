
function goFetch (rule, request, event, matching) {
    
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
    
    let actionType = Object.keys(rule.action)[0],
        tmpUrl = rule.action.fetch || rule.action.redirect;
    
    let opts = rule.options || {};
    opts.headers = opts.headers || new Headers();
    
    // if there are group variables in the matching expression
    if (matching.length > 2 && tmpUrl) {
        // we apply the variables
        matching.forEach(function(cur, idx){
            tmpUrl = tmpUrl.replace(new RegExp('\\$' + idx, 'i'), cur);
        });
    }
    
    // in case there is a tmpUrl
    // it means it is a redirect or fetch action
    if (tmpUrl) {
        // and we will use it to replace the current request

        // if the cache options is false, we force it not to be cached
        if(rule.action.cache === false){
            opts.headers.append('pragma', 'no-cache');
            opts.headers.append('cache-control', 'no-cache');
            tmpUrl = tmpUrl + (tmpUrl.indexOf('?') > 0 ? '&' : '?') + (new Date).getTime();
        }
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