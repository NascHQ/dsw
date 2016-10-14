import utils from './utils.js';

let origin = location.origin;

function goFetch (rule, request, event, matching) {
    let tmpUrl = rule? (rule.action.fetch || rule.action.redirect) : '';
    if (typeof request == 'string') {
        request = location.origin + request;
    }
    if (!tmpUrl) {
        tmpUrl = request.url || request;
    }
    let originalUrl = tmpUrl;
    let sameOrigin = (new URL(tmpUrl)).origin == origin;

    // if there are group variables in the matching expression
    tmpUrl = utils.applyMatch(matching, tmpUrl);

    // if no rule is passed
    if (request && !rule) {
        // we will just create a simple request to be used "anywhere"
        let mode = request.mode;
        if (!mode || mode == 'navigate') {
            mode = (sameOrigin? 'cors': 'no-cors');
        }

        let req = new Request(tmpUrl, {
            method: request.method || 'GET',
            headers: request.headers || {},
            mode: mode,
            cache: 'default',
            redirect: 'manual'
        });

        if (request.body) {
            req.body = request.body;
        }

        req.requestId = (event? event.request: request).requestId;
        req.traceSteps = (event? event.request: request).traceSteps;

        return req;
    }

    let actionType = Object.keys(rule.action)[0];
    let opts = rule.options || {};
    opts.headers = opts.headers || new Headers();

    // if the cache options is false, we force it not to be cached
    if(rule.action.cache === false){
        opts.headers.append('pragma', 'no-cache');
        opts.headers.append('cache-control', 'no-store,no-cache');
        tmpUrl = tmpUrl + (tmpUrl.indexOf('?') > 0 ? '&' : '?') + (new Date).getTime();
    }

    // we will create a new request to be used, based on what has been
    // defined by the rule or current request
    let reqConfig = {
        method: opts.method || request.method,
        headers: opts || request.headers,
        mode: actionType == 'redirect'? (request.mode || 'same-origin') : 'cors',
        redirect: actionType == 'redirect'? 'manual' : request.redirect
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

    request.requestId = (event? event.request: request).requestId;
    request.traceSteps = (event? event.request: request).traceSteps;

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
