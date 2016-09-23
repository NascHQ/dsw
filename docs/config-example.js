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
    // DSW Also offers push notification support with a nice API for your clients
    // and a powerful mechanism for notifications.
    "notification": {
        // if true, will ask for notifications permission as soon as the SW gets registered
        "auto": false,
        // For now, GCM is the only supported service for push notifications
        "service": "GCM",
        // set here your project's id in GCM
        "senderId": "your-project-id",
        // when notified, where could DSW get information about title, body and icon for the notification
        "dataSrc": "http://where.to/get-your/notification-data",
        // in case title, body and icon are not in the root path of the object received from dataSrc
        "dataPath": "notification",
        // Target is used when the user clicks on the notification.
        // It will then open a window with this source, or focus a tab, in case it is already opened
        "target": "/"
    },
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
                // We are looking for everything with a status 400 or 500
                "status": [404, 500],
                // AND with one of these extensions
                "extension": ["jpg", "gif", "png", "jpeg", "webp"]
            },
            "apply": {
                // will actually become a default 404 image
                "fetch": "/images/public/404.jpg"
            }
        },
        // You can also output a string right away
        "easterEgg": {
            "match": { "path": "/easter-egg" },
            "apply": {
                // by using the output action (it accepts variables, as in other examples)
                "output": "You found an easter egg!!!"
            }
        }
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
                "path": "/legacy-images/.*"
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
            "match": { "path": "/images/not-cached" },
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
        // In this example, we are redirecting requests using variables
        // from the matching regular expression
        "redirectWithVar": {
            "match": {
                // We can use in our _apply_ actions, the groups from
                // this expression, between parenthesis
                "path": "/old-site/(.*)"
            },
            "apply": {
                // here, each groups is represented by a variable, in order
                // accessed as $x where x is the position of the variable
                // in the matching expression
                "redirect": "/redirected.html?from=$1"
            }
        },
        // Lets cache everything that has html extension OR is at /
        // Notice there we are using the OR here, instead of just the AND
        "static-html": {
            "match": [
                // everything with the html or htm extension
                { "extension": ["html", "htm"] },
                // OR
                // everything in /
                { "path": "/$" }
            ],
            // The default strategy is 'offline-first'
            // With the online-first strategy, it will ALWAYS go for the
            // network and use it to update the cache.
            // Cache will ONLY be used when the network fails.
            "strategy": "online-first",
            "apply": {
                "cache": {
                    "name": "static-html-files",
                    "version": "1"
                    // we can also expire the cache
                    "expires": "1h" // 1s, 1m, 1h, 1d, 1w, 1M, 1y
                }
            }
        },
        // Let's use IndexedDB to store some data
        "userData": {
            "match": { "path": "/api/user/.*" },
            // We will try to keep it up to date.
            // DSW will look for it online, and if not possible, then look in the
            // cached object in IndexedDB.
            "strategy": "offline-first",
            "apply": {
                "indexedDB": {
                    // The IndexedDB name
                    "name": "userData",
                    // The version of it. If you change it, your db will be updated.
                    "version": "3",
                    // The _json_ data we are expecting in this example gives us
                    // and id, and we will use it as our kay for the IndexedDB structure.
                    "key": "id",
                    // but we will also define some indexes
                    "indexes": [
                        // one of the indexes is the property "name"
                        "name",
                        // the other index is the property "twitter"...
                        {
                            "name": "twitter",
                            "path": "twitter",
                            // ...but for this one, we want to specify that it is unique.
                            "options": {
                                "unique": true
                            }
                        }
                    ]
                }
            }
        },
        // You can also bypass some requests
        "byPassable": {
            "match": { "path": "/bypass/" },
            "apply": {
                // With the "request" value, it WILL perform the request, with no treatment.
                // But the response will either be the response itself(in case of success)
                // or an empty string(if failed)
                "bypass": "request"
            }
        },
        // When bypassing, you may also want to simply ignore some path
        "ignorable": {
            // imagine you have an old path and that some legacy script, html or css is
            // still trying to load resources from it
            "match": { "path": "/ignore/" },
            "apply": {
                // by ignoring it, no network request will be started, and the output
                // will be always a successful empty string
                "bypass": "ignore"
            }
        },
        "dashbord": {
            "match": { "path": "/api/dashbord/.*" },
            // Here, we are telling the browser to send cookies and session credentions
            // when fetching this
            // You can pass any options accepted by fetch, here
            "options": { "credentials": "same-origin"},
            // With the fastest strategy, both the network and cache will be verified.
            // It means it will _always_ start a new request, but also means that
            // once it's resolved, it will keep the cache up to date.
            // If the data is in cache, it will use the cached data.
            // It assures us that the fastest result will be used, but also, that
            // it will keep the data up to date in the cache
            "strategy": "fastest",
            "apply": {
                // indexedDB support is still under development...
                "indexedDB": {
                    "name": "dashbord",
                    "version": "1",
                    // we can specify indexes using only strings
                    "indexes": ["name"]
                }
            }
        }
    }
}






