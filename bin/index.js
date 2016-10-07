#!/usr/bin/env node

"use strict";

var program = require('commander');
var fs = require('fs');
var verbose = false;
var dsw = require('../lib/dsw.js');
var colors = require('colors');
var stoped = false;

// COMMAND
program
    .version(require('../package.json').version)
    .usage('[command] [options] [directory]')
    .option(colors.bold('--verbose'), 'Shows logs and output')
    .option('-f, --format [format]', 'The dswfile format (js, nodejs or json)', /(js|nodejs|json)/, 'json')
    .on('verbose', function() {
        verbose = true;
        console.log('getting verbose, here');
    })
    .on('--help', function() {
        console.log('  Examples:');
        console.log();
        console.log(colors.gray('    # will look for a dswfile.json in there and create \n    the service worker file in this same directory'),
                    '\n    $ dsw ./path-to/your-project');
        console.log();
    })
    .on('-v', function() {
        console.log(dsw.getVersion());
    });

// INIT
program
    .command('init [directory]')
    .alias('i')
    .description('Creates a default dswfile.json in the given directory')
    .option("-t, --template <template>", "Which exec mode to use", 'pwa')
    .action(function(directory, options){
        directory = directory || '.';
        stoped = require('./init.js').run(directory, options);
        dsw.generate(directory, program).then(_=>{
            console.log('\n', (new Array(68)).join('-'), '\n');
        });
    })
    .on('--help', function() {
        console.log('  Examples:');
        console.log();
        console.log('    $ dsw i');
        console.log('    $ dsw init');
        console.log('    $ dsw init path-to-project');
        console.log('    $ dsw i path-to-project');
        console.log('    $ dsw i path-to-project -t pwa');
        console.log('    $ dsw i path-to-project -t page');
        console.log();
    });

program.parse(process.argv);

// in case nothing was passed we will use the current location
// but user can also send only the path, so we use it
if (!stoped && program.args && (program.args[0] || process.argv.length == 2 )) {
    dsw.generate(program.args[0], program).then(_=>{
        console.log('\n', (new Array(68)).join('-'), '\n');
    });
}
