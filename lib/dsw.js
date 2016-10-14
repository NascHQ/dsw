/*
  This is the module, to be required.
*/

const path = require('path');

const DSW = {
    getVersion: function () {
        return '';
    },
    generate: function (userPath, options) {

        options = options || {};
        options.format = options.format || 'json';

        return new Promise((resolve, reject)=>{
            const TMP_FILE = path.normalize('./.tmp-dsw-lib.js');
            const MANIFEST = path.normalize('/webapp-manifest.json');
            var verbose = true;

            if (options.verbose != 1) {
                console.info = function () {};
                verbose = false;
            }

            var fs = require('fs'),
                dswPath = path.join(process.cwd(), userPath || ''),
                finalPath = path.normalize(path.join(dswPath,
                    'dswfile.' + options.format
                        .replace(/\/\//g, '/'))),
                lib,
                settings,
                fullContent;
            var version = require(__dirname + '/../package.json').version;
            var versionString = 'DSW: v' + version + ' Node: '+process.version
                //minifier = require('minifier');

            console.log('[DSW] :: ' + versionString);
            console.info('[DSW] :: Loading files');
            try {
                lib = fs.readFileSync(path.normalize(__dirname + '/../dist/dsw.js'), 'utf8');
                lib = lib.replace('#@!THE_DSW_VERSION_INFO!@#', version);

                if (options.format == 'json') {
                    settings = fs.readFileSync(finalPath, 'utf8');
                    fullContent = "const PWASettings = " + settings
                        + ';\n'
                        + lib;
                    settings = JSON.parse(settings);
                }else if (options.format == 'nodejs') {
                    // in nodejs mode, we execute the setup method, which should
                    // return an object, to be parsed and used
                    settings = require(finalPath);
                    settings = settings.setup(options)
                    fullContent = "const PWASettings = "
                        + JSON.stringify(settings)
                        + ';\n'
                        + lib;
                } else {
                    // if it is in js mode, we will allow the js to run in client side
                    settings = fs.readFileSync(finalPath, 'utf8');
                    fullContent = "const PWASettings = (return " + settings + ';)();\n'
                        + lib;
                    settings = JSON.parse(settings);
                }
            }catch(e){
                console.error("[ERROR] :: Failed reading file at " + finalPath, verbose? e.message: e);
                reject(e)
                return;
            }

            console.info('[DSW] :: Writing your service worker (dsw.js) based on your dswfile');
            fs.writeFileSync(finalPath.replace(/dswfile\.json$/, 'dsw.js'),
                             fullContent,
                             'utf8');

            console.info('[DSW] :: Writing your manifest');
            var manifestContent = fs.readFileSync(path.normalize(__dirname + '/../src/manifest-model.json'), 'utf8');

            try {
                if (fs.existsSync( dswPath + MANIFEST )) {
                    manifestContent = fs.readFileSync(dswPath + MANIFEST, 'utf8');
                }

                if(options.format == 'json' && settings.notification) {
                    if (settings.notification.service == 'GCM') {
                        var regEx = /"gcm_sender_id"\: ".+\",/;
                        // if it already has the gcm_sender_id set
                        if (manifestContent.match(regEx)) {
                            // we will update it
                            manifestContent = manifestContent.replace(regEx,
                                                                      '"gcm_sender_id": "' +
                                                                      settings.notification.senderId +
                                                                      '",');
                        } else {
                            // if it did not have the gcm_sender_id specified,
                            // we will add this right after the name property (which is mandatory)
                            regEx = /("name":( )?\".+\",)/;
                            manifestContent = manifestContent.replace(regEx,
                                                                      '$1\n    ' +
                                                                      '"gcm_sender_id": "' +
                                                                      settings.notification.senderId +
                                                                      '",');
                        }
                    } else {
                        console.warn('[DSW] :: Notification Server not supported\n         Please add it to your manifest file.');
                    }
                }

                fs.writeFileSync(dswPath + MANIFEST, manifestContent, 'utf8');

            }catch(e){
                console.error('Could not write the manifest file. Possibly due to a permission issue.\n', e.message);
            }

//            console.log('[DSW] :: Tip ::')
//            console.log('         Don\'t forget to link your manifest in your index.html file:\n' +
//                        '         <link rel="manifest" href="/webapp-manifest.json">\n         <meta name="theme-color" content="#color">');
            console.log('[DSW] :: Start your HTTP server at:\n         ' + dswPath);
            console.log('[DSW] :: Done, now go play outside!');

            // looking for updates
            var fetch = require('node-fetch');
            fetch('https://registry.npmjs.org/dsw').then(res => {
                if (200 === res.status) {
                    res.json().then(data => {
                        var latest = data['dist-tags'].latest;
                        if (version != latest) {
                            console.log('\n[DSW] !! DSW is outdated! Update it by running:\n         npm install -g dsw');
                        }
                        resolve();
                    }).catch(_=>{
                        resolve();
                    });
                } else {
                    resolve();
                }
            }).catch(err=>{
                resolve();
            });
        });
    }
};

try {
    module.exports = DSW;
}catch(e){}
