const PWASettings = {
    "dswVersion": 2.2,
    "applyImmediately": true,
    "appShell": [],
    "enforceSSL": false,
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
                    "version": "1"
                }
            }
        },
        "static-html": {
            "match": { "extension": ["html"] },
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
            "apply": {
                "indexedDB": {
                    "name": "userData",
                    "version": "1",
                    "indexes": ["name"]
                }
            }
        },
        "updates": {
            "match": { "path": "\/api\/updates/" },
            "keepItWarm": true,
            "apply": {
                "indexedDB": {
                    "name": "shownUpdates",
                    "version": "1"
                }
            }
        },
        "articles": {
            "match": { "path": "\/api\/updates/" },
            "apply": {
                "cache": {
                    "name": "cachedArticles",
                    "version": "1"
                }
            }
        },
        "events": {
            "match": { "path": "\/api\/events/" },
            "apply": {
                "indexedDB": {
                    "name": "eventsList",
                    "version": "1"
                }
            }
        },
        "lineup": {
            "match": { "path": "\/api\/events\/(.*)/" },
            "apply": {
                "indexedDB": {
                    "name": "eventLineup-$1",
                    "version": "1"
                }
            }
        }
    }
}
;
/*
  This is the module, to be required.
*/

module.exports = {
    generate: function (userPath, options) {
        
        options = options || {};
        options.format = options.format || 'json';
        
        return new Promise((resolve, reject)=>{
            const TMP_FILE = './.tmp-dsw-lib.js';
            const MANIFEST = '/webapp-manifest.json';
            var verbose = true;
            
            if (options.verbose != 1) {
                console.info = function () {};
                verbose = false;
            }

            var fs = require('fs'),
                dswPath = './' + (userPath || ''),
                path = (dswPath + '/dswfile.' + options.format)
                        .replace(/\/\//g, '/'),
                lib,
                settings,
                fullContent;
                //minifier = require('minifier');

            console.info('2/6 => Loading files');
            try {
                lib = fs.readFileSync(__dirname + '/dsw.js', 'utf8');
                if (options.format == 'json') {
                    settings = fs.readFileSync(path, 'utf8');
                    fullContent = "const PWASettings = " + settings + ';\n' + lib;
                }else if (options.format == 'nodejs') {
                    // in nodejs mode, we execute the setup method, which should
                    // return an object, to be parsed and used
                    settings = require(path);
                    fullContent = "const PWASettings = "
                        + JSON.stringify(settings.setup(options))
                        + ';\n'
                        + lib;
                } else {
                    // if it is in js mode, we will allow the js to run in client side
                    settings = fs.readFileSync(path, 'utf8');
                    fullContent = "const PWASettings = (return " + settings + ';)();\n' + lib;
                }
            }catch(e){
                console.error("Failed reading file at " + path, verbose? e.message: '');
                reject(e.message)
                return;
            }
            
            fs.writeFileSync(path.replace(/dswfile\.json$/, 'dsw.js'),
                             fullContent,
                             'utf8');

            console.info('5/6 => Writing your manifest');
            var manifestContent = fs.readFileSync(__dirname + '/../src/manifest-model.json');
            try {
                if (!fs.existsSync( dswPath + MANIFEST )) {
                    fs.writeFileSync(dswPath + MANIFEST, manifestContent, 'utf8');
                }else{
                    console.info('Manifest was already there');
                }
            }catch(e){
                console.error('Could not write the manifest file. Possibly due to a permission issue.\n', e.message);
            }

            console.log('Don\'t forget to link your manifest in your index.html file:\n' +
                         '    <link rel="manifest" href="/webapp-manifest.json">\n    <meta name="theme-color" content="#color">');

            console.info(' 6 ... your are good to go, sir!\n\n    ()_()\n    (ᵔᴥᵔ)\n\nStart your HTTP server at ' + dswPath + '\n');
            console.log('done');
            resolve();
        });
    }
};
