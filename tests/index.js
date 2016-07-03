require('babel-polyfill');
var assert = require('chai').assert;

var getBestMatchingRX = require("../bundle-dsw.js");
//import getBestMatchingRX from "./best-matching-rx.js";

describe('todo', function() {
    it('should add tests here', function () {
        assert.equal(1, 1);
        //assert.equal('/.+\/images\/(.+)/i', getBestMatchingRX("domain.com/images/something.png").toString());
        //assert.equal(/.+\/images\/one-specific-image.png/i, getBestMatchingRX("domain.com/images/one-specific-image.png").toString());
    });
});

