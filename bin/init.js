var fs = require('fs');

module.exports = (()=>{
    return {
        run: function (directory, options) {

            function treatIndex () {
                const fd = fs.openSync(directory + '/index.html', 'a+');
                const SW_CALL = `
@ind@ind<script src="dsw.js"></script>
@ind@ind<script>
@ind@ind@indDSW.setup()
@ind@ind@ind@ind.then(function(result){
@ind@ind@ind@ind@ind// tell your users about the good news
@ind@ind@ind@ind})
@ind@ind@ind@ind.catch(function(reason){
@ind@ind@ind@ind@ind// ops!
@ind@ind@ind@ind});
@ind@ind</script>`;
                const VIEWPORT = `
@ind@ind<meta name="viewport" content="width=device-width, initial-scale=1">`;
                const WP_META = `
@ind@ind<!-- WEB APP META DATA -->
@ind@ind<link rel="manifest" href="/webapp-manifest.json">
@ind@ind<meta name="theme-color" content="#DD5939"> <!-- set theme's color -->
@ind@ind<!-- /WEB APP META DATA -->`;
                const FULL_INDEX = `<!doctype html>
<html>
    <head>
        ${VIEWPORT}
        ${WP_META}
        ${SW_CALL}
    </head>
    <body>
    </body>
</html>
`;
                var indexContent = fs.readFileSync(directory + '/index.html', 'utf-8');

                // if index is empty, we write a default template for it
                if (!indexContent.replace(/[\n\r \t]/g, '').length) {
                    indexContent = FULL_INDEX;
                } else {
                    var indent = indexContent.match(/[\n|\r]([ \t]){2,}/g);
                    if (indent) {
                        indent = indent[0].replace(/[\n\r]/g, '');
                    } else {
                        indent = '  ';
                    }

                    // if the index file doesn't have the viewport, we add it
                    if (!indexContent.match('\<meta(^\>)+name=[\'\"]viewport[\'\"]')) {
                        indexContent = indexContent.replace(/([ \t]+)?\<\/(head|body|html)\>/, `${VIEWPORT.replace(/@ind/g, indent)}
$1</$2>`);
                    }
                    // if the index file doesn't have a DSW.setup call, we add it
                    if (!indexContent.match(/DSW([ \t\n\r]?).([ \t\n\r]?)setup([ \t\n\r]?)\(/)) {
                        indexContent = indexContent.replace(/([ \t]+)?\<\/(head|body|html)\>/, `${SW_CALL.replace(/@ind/g, indent)}
$1</$2>`);
                    }
                    // if the index file has no web app metadata, we add it
                    if (!indexContent.match('\<link(^\>)+rel=[\'\"]manifest[\'\"]')) {
                        indexContent = indexContent.replace(/([ \t]+)?\<\/(head|body|html)\>/, `${WP_META.replace(/@ind/g, indent)}
$1</$2>`);
                    }
                }
                fs.writeFileSync(directory + '/index.html', indexContent, 'utf-8');
            }

            function createDSWFile () {
                const fd = fs.openSync(directory + '/dswfile.json', 'a+');
                const FULL_DSW_CONTENT = `{
    "dswVersion": 1.0,
    "applyImmediately": true,
    "appShell": [
        "/index.html?homescreen=1"
    ],
    "enforceSSL": false,
    "keepUnusedCaches": false,
    "dswRules": {
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
                    "version": "1",
                    "expires": "1h"
                }
            }
        },
        "static-html": {
            "match": [
                { "extension": ["html"] },
                { "path": "/$" }
            ],
            "strategy": "fastest",
            "apply": {
                "cache": {
                    "name": "static-html-files",
                    "version": "1"
                }
            }
        },
        "pageNotFound": {
            "match": {
                "status": [404]
            },
            "apply": {
                "fetch": "/not-found.html"
            }
        },
        "imageNotFound": {
            "match": {
                "status": [404, 500],
                "extension": ["jpg", "gif", "png", "jpeg", "webp"]
            },
            "apply": {
                "fetch": "/404.jpg"
            }
        }
    }
}`;

                var dswContent = fs.readFileSync(directory + '/dswfile.json', 'utf-8');

                if (!dswContent.replace(/[\n\r \t]/g, '').length) {
                    dswContent = FULL_DSW_CONTENT;
                    fs.writeFileSync(directory + '/dswfile.json', dswContent, 'utf-8');
                }
            }

            function createDefaultFiles () {
                var fd = fs.openSync(directory + '/not-found.html', 'a+');
                var content = fs.readFileSync(directory + '/not-found.html', 'utf-8');
                if (!content.replace(/[\n\r \t]/g, '').length) {
                    fs.writeFileSync(directory + '/not-found.html', "404, page not found!", 'utf-8');
                }

                try {
                    fd = fs.openSync(directory + '/404.jpg', 'a+');
                }catch(e){
                    fd = false;
                    // :/
                }
                if (!fd) {
                    var inStr = fs.createReadStream(__dirname + '/../docs/images/default-404-image.jpg');
                    var outStr = fs.createWriteStream(directory + '/404.jpg');
                    inStr.pipe(outStr);
                }
            }

            console.log('[DSW]~init :: Initializing directory ' + directory);
            treatIndex();
            console.log('[DSW]~init :: Applied ' + directory + '/index.html');
            createDSWFile();
            console.log('[DSW]~init :: Created a default dswfile.json at ' + directory);
            createDefaultFiles();
            console.log('[DSW]~init :: Created default files at ' + directory + ' (including 404.jpg and not-found.html)');
            return true;
        }
    };
})();
