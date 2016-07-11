#!/usr/bin/env node

"use strict";

console.info('1/6 => Starting up');
const TMP_FILE = './.tmp-dsw-lib.js';
const MANIFEST = '/webapp-manifest.json';

let fs = require('fs'),
    dswPath = './' + (process.argv[2] || ''),
    path = (dswPath + '/dswfile.json')
            .replace(/\/\//g, '/'),
    lib,
    settings,
    fullContent;
    //minifier = require('minifier');

console.info('2/6 => Loading files');
try {
    lib = fs.readFileSync(__dirname + '/dsw.js', 'utf8');
    settings = fs.readFileSync(path, 'utf8');
}catch(e){
    console.error("Failed reading file!", e.message);
    return;
}

// validate the json file before generating it
console.info('3/6 => Validating JSON');
try{
    let jsonData = JSON.parse(settings);
    let vrs = parseFloat(jsonData.dswVersion || 0).toFixed(1);
    if (vrs%1 !== 0) {
        vrs+= .1;
    }else{
        vrs++;
    }
    jsonData.dswVersion = vrs;
    settings = JSON.stringify(jsonData);
}catch(e){
    console.error('Invalid JSON data!', e.message, e.line);
    return;
}

console.info('4/6 => Writing dswfile.js');

fullContent = "const PWASettings = " + settings + ';\n' + lib;

fs.writeFileSync(path.replace(/dswfile\.json$/, 'dsw.js'),
                 fullContent,
                 'utf8');

console.info('5/6 => Writing your manifest');
let manifestContent = fs.readFileSync(__dirname + '/src/manifest-model.json');
try {
    if (!fs.existsSync( dswPath + MANIFEST )) {
        fs.writeFileSync(dswPath + MANIFEST, manifestContent, 'utf8');
    }else{
        console.info('Manifest was already there');
    }
}catch(e){
    console.error('Could not write the manifest file. Possibly due to a permission issue.\n', e.message);
}

console.info('Don\'t forget to link your manifest in your index.html file:\n' +
             '    <link rel="manifest" href="/webapp-manifest.json">\n    <meta name="theme-color" content="#color">');

console.info(' 6 ... your are good to go, sir!\n\n    ()_()\n    (ᵔᴥᵔ)\n\nStart your HTTP server at ' + dswPath + '\n');

// write a temporary file with the combination of both settings and lib files
//console.info('1) Writing temporary file');
//fs.writeFileSync(TMP_FILE, fullContent, 'utf8');

// minify it
//console.info('2) Minifying content');
//minifier.on('error', function(err) {
//	console.error('Failed generating Dynamic Service Worker!', err);
//});
//try {
//    minifier.minify(TMP_FILE, {
//        output: path.replace(/dswfile\.json$/, 'dsw.js')
//    });
//    console.info('3) Dynamic Service worker generated.');
//}catch(e){
//    console.error("Failed minifying the file!", e.message);
//    return;
//}
// and then remove the useless file
//fs.unlinkSync(TMP_FILE);
