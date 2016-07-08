'use strict';

/* eslint-env mocha */
const assert = require('assert');
const childProcess = require('child_process');

describe('Source code', function() {
    it('Should pass all the lint rules', () => {
        assert(childProcess.execSync('npm run lint'));
    });
});
