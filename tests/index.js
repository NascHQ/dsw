require('babel-polyfill');
var assert = require('chai').assert;

var getBestMatchingRX = require("../bundle-dsw.js");
//import getBestMatchingRX from "./best-matching-rx.js";

describe('Regular expressions', function() {
    it('Matching extensions', function () {
        //var rx = /(\\.)?(([js|json])?)([\\?\&\/].+)?)/;
        var rx = /.+(\\.([js|json]))?([\\?\&\/].+)?/i;
        assert.equal("foo/".match(rx)[3], undefined);
        assert.equal("foo/index.html".match(rx)[3], undefined);
        assert.equal("foo/bar.js".match(rx)[3], 'js');
        assert.equal("foo/bar.json".match(rx)[3], 'json');
        //assert.equal("foo/bar.js?baz=123&xyz".match(rx)[3], 'js');
        //assert.equal("foo/bar.json?baz=123&xyz".match(rx)[3], 'json');
        
        //assert.equal('/.+\/images\/(.+)/i', getBestMatchingRX("domain.com/images/something.png").toString());
        //assert.equal(/.+\/images\/one-specific-image.png/i, getBestMatchingRX("domain.com/images/one-specific-image.png").toString());
    });
});

