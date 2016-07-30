/*
  This is the module, to be required.
*/

const path = require('path');

const DSW = {
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
                //minifier = require('minifier');

            console.info('[DSW] :: Loading files');
            try {
                lib = fs.readFileSync(path.normalize(__dirname + '/../dist/dsw.js'), 'utf8');
                if (options.format == 'json') {
                    settings = fs.readFileSync(finalPath, 'utf8');
                    fullContent = "const PWASettings = " + settings
                        + ';\n'
                        + lib;
                }else if (options.format == 'nodejs') {
                    // in nodejs mode, we execute the setup method, which should
                    // return an object, to be parsed and used
                    settings = require(finalPath);
                    fullContent = "const PWASettings = "
                        + JSON.stringify(settings.setup(options))
                        + ';\n'
                        + lib;
                } else {
                    // if it is in js mode, we will allow the js to run in client side
                    settings = fs.readFileSync(finalPath, 'utf8');
                    fullContent = "const PWASettings = (return " + settings + ';)();\n'
                        + lib;
                }
            }catch(e){
                console.error("[ERROR] :: Failed reading file at " + finalPath, verbose? e.message: '');
                reject(e.message)
                return;
            }
            
            console.info('[DSW] :: Writing your service worker (dswfile)');
            fs.writeFileSync(finalPath.replace(/dswfile\.json$/, 'dsw.js'),
                             fullContent,
                             'utf8');

            console.info('[DSW] :: Writing your manifest');
            var manifestContent = fs.readFileSync(path.normalize(__dirname + '/../src/manifest-model.json'));
            try {
                if (!fs.existsSync( dswPath + MANIFEST )) {
                    fs.writeFileSync(dswPath + MANIFEST, manifestContent, 'utf8');
                }else{
                    console.info('[DSW] :: Manifest was already there');
                }
            }catch(e){
                console.error('Could not write the manifest file. Possibly due to a permission issue.\n', e.message);
            }

            console.log('[DSW] :: Tip ::')
            console.log('         Don\'t forget to link your manifest in your index.html file:\n' +
                        '         <link rel="manifest" href="/webapp-manifest.json">\n         <meta name="theme-color" content="#color">');
            console.log('[DSW] :: Start your HTTP server at:\n         ' + dswPath);
            console.log('[DSW] :: Done, now go play outside!');
            resolve();
        });
    }
};

try {
    module.exports = DSW;
}catch(e){}
