#!/usr/bin/env node

"use strict";

var program = require('commander');
var fs = require('fs');
var verbose = false;
var dsw = require('../lib/dsw.js');

program
    .version(require('../package.json').version)
    .usage('[options] [directory]')
    .option('--verbose', 'Shows logs and output')
    .option('-f, --format [format]', 'The dswfile format (js, nodejs or json)', /(js|nodejs|json)/, 'json')
    .on('--help', function() {
        console.log('  Examples:');
        console.log();
        console.log('    $ dsw ./path-to/your-project');
        console.log();
    })
    .parse(process.argv);

dsw.generate(program.args[0], program);

setTimeout(_=>{
    // let's just show a line saying we have finished it
    console.log('\n', (new Array(68)).join('-'), '\n');
}, 1000);
