{
    // This is the **version** of your cached configuration.
    // In case you want to reload it, some change must be done in this file, if 
    // not in the content itself, at least, in the version number.
    // This number is also used to name your cached files.
    "dswVersion": 2.2,
    // Will force previous service workers to stop, and replace them for the newer one
    // otherwise, your new service worker configuration will only take place when
    // the current service worker experes (the next reload, or about a day)
    "applyImmediately": true,
    // Add here, a list of files that should be cached during the installation of the webservice.
    "appShell": [],
    // If this is set to true, every request for http:// will be redirected to https://
    "enforceSSL": false,
    // Default is false, if changed to true, will NOT delete other caches
    // otherwise, all caches but the current ones will be deleted on activation
    "keepUnusedCaches": false,
    // Here is where you will add all of your rules.
    // You can create as many as you want, and name them as you will.
    "dswRules": {
        // You may name your rules here
        // this rule will redirect every not found image (or with error) to
        // a default image
        "imageNotFound": {
            // everything that matches a status like 404 or 500
            // and is an image (in the given extensions)
            "match": {
                "status": [404, 500],
                "extension": ["jpg", "gif", "png", "jpeg", "webp"]
            },
            "apply": {
                // will actually become a default 404 image
                "fetch": "/images/public/404.jpg"
            }
        },
        // This other example redirects pages that are not found
        "pageNotFound": {
            // Any requisition that has a 404 status (including css, js, etc)
            "match": {
                "status": [404]
            },
            "apply": {
                // will receive our default 404 page
                "fetch": "/404.html"
            }
        },
        // Redirecting requests
        "redirectOlderPage": {
            "match": {
                // In this example, everything inside this directory should be redirected
                "path": "\/legacy-images\/.*"
            },
            "apply": {
                // we simply fetch the different content
                // we could also use the "redirect" action here, it would work
                // as the same, but with a 302 status header
                "fetch": "/images/public/gizmo.jpg"
            }
        },
        // Some times, we want something NOT to be cached.
        // In the following examples, we will cache EVERY image.
        // That's why we are defining here one exception.
        "imageNotCached": {
            // the image named "not-cached" will
            "match": { "path": "\/images\/not-cached" },
            "apply": {
                // not be cached...ever!
                "cache": false
            }
        },
        // Now, let's create a cache for every single image (except the one before)
        "images": {
            // Everything that matches the right extensions (and has a status
            // different than 404 or 500, once we already defined rules for those)
            "match": { "extension": ["jpg", "gif", "png", "jpeg", "webp"] },
            "apply": {
                "cache": {
                    // will be cached at "cached-images::1"
                    "name": "cached-images",
                    // If you don't specify the version, it uses the value in dswVersion
                    "version": "1"
                }
            }
        },
        // let's cache our static files
        "statics": {
            // all of our scripts and styles will be cached (once they don't meet
            // the prefious criteria of 404 status)
            "match": { "extension": ["js", "css"] },
            "apply": {
                "cache": {
                    "name": "static-files",
                    "version": "1"
                }
            }
        },
        "userData": {
            "match": { "path": "\/api\/user\/.*" },
            // Here, we are telling the browser to send cookies and session credentions
            // when fetching this
            // You can pass any options accepted by fetch, here
            "options": { "credentials": "same-origin"},
            "apply": {
                // indexedDB support is still under development...
                "indexedDB": {
                    "name": "userData",
                    "version": "1",
                    "indexes": ["name"]
                }
            }
        },
        // In this example, we are redirecting requests using variables
        // from the matching regular expression
        "redirectWithVar": {
            "match": {
                // We can use in our _apply_ actions, the groups from
                // this expression, between parenthesis
                "path": "\/old-site\/(.*)"
            },
            "apply": {
                // here, each groups is represented by a variable, in order
                // accessed as $x where x is the position of the variable
                // in the matching expression
                "redirect": "/redirected.html?from=$1"
            }
        }
        
        
        /*,
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
        }*/
    }
}
