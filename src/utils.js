
const utils = {
    DSWManager: null,
    PWASettings: null,
    // Applies the matched patterns into strings (used to replace variables)
    applyMatch (matching, text) {
        if (matching && matching.length > 1 && text) {
            // we apply the variables
            matching.forEach(function(cur, idx){
                text = text.replace(new RegExp('\\$' + idx, 'i'), cur);
            });
        }
        return text;
    },

    createRequest (request, reqData) {
        let reqConfig = {
            method: reqData.method || request.method || 'GET',
            headers: reqData.headers || request.headers || new Headers(),
            mode: reqData.mode || (reqData.redirect? 'same-origin' : 'cors'),
            redirect: reqData.redirect || 'manual',
            cache: 'default'
        };

        let req = new Request(request.url || request, reqConfig);
        req.requestId = request.requestId;
        return req;
    },

    fixURL (url) {
        if (utils.DSWManager.rootSWScope != url) {
            return url.replace(/^([^http]|[^\/]|[^\.])/, utils.DSWManager.rootSWScope + '/$1')
                      .replace(/([^\:])\/\//g, '$1');
        } else {
            return url;
        }
    },

    setup (DSWManager, PWASettings, DSW) {
        utils.DSWManager = DSWManager;
        utils.PWASettings = PWASettings;
        utils.DSW = DSW;
    }
};

export default utils;
