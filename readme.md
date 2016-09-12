# Dynamic Service Worker
![Dynamic Service Worker](https://raw.githubusercontent.com/NascHQ/dsw/master/docs/images/worker-person.png)

[![Version](https://img.shields.io/npm/v/dsw.svg?label=Version&maxAge=2592000)](https://www.npmjs.com/package/dsw)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/bb589aedc04b445d9633ddf66b55da06)](https://www.codacy.com/app/felipenmoura/dsw?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=NascHQ/dsw/&amp;utm_campaign=Badge_Grade) 
[![GitHub [ERROR] :: Failed reading file at /Library/WebServer/Documents/www/tests/deletar-dsw/dswfile.jsonlicense](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/NascHQ/dsw/master/license.txt) 
[![GitHub issues](https://img.shields.io/github/issues/NascHQ/dsw.svg)](https://github.com/NascHQ/dsw/issues) 
[![Build Status](https://travis-ci.org/NascHQ/dsw.svg)](https://travis-ci.org/NascHQ/dsw) 

DSW allows you to enable and use Service Workers in a much easier way, also helping you to create and maintain your Progressive Web Apps working offline.<br/>
You will simply have to set up how your service worker will handle requests in a JSON file. Read the [commented JSON example](https://naschq.github.io/dsw/config-example.html) or the documentation and examples below.

If you are starting from scratch and want to see it working right away, you can use the content inside of `/boilerplate`.

## Live Demo

You can access this page and see a live demo of DSW working.
After loading the page the first time, it will install the service worker. When opening it the second time, it will cache everything according to the defined rules (described in each block and link).
You can then go offline and reload the page to validate it.
[Dynamic Service Worker demo](https://dsw-demo-jmfnlolzjo.now.sh)

## Advantages

- Use of variables to build URLs and redirects
- Different strategies (offline-first, online-first or fastest)
- Easy-to-set rules for 404 pages, redirects, cache or use indexedDB, or outpus
- Trace requests to debug your configuration, rules and filters
- Decision over cache naming and versioning for each matching request
- Many named rules (for future debugging tooling...I imagine we can have a lighthouse-like page for debugging your service workers and your rules)
- Support for indexedDB
- Support for messaging and syncing events (under development)
- Quite simple JSON configuration and easy to start with the basic, or go further for more complex cases
- Client API with many possibilities
- Support for opaque requests

## Installing it

It's a Node.js program that you may install globally:

```npm install -g dsw```

Or locally:

```npm install dsw --save-dev```


## Using it

DSW will look for a file called `dswfile.json`, just like gulp or grunt do.<br/>
So:

1) Go to your project's root directory and create the `dswfile.json`.

```
cd path-to-your-project
touch dswfile.json
```

You will use your prefered editor to make changes to this file later.

2) Add this to your `index.html` file, in the `head` element:

```html
    <link rel="manifest" href="/webapp-manifest.json" />
    <meta name="theme-color" content="#color">
    <script src="dsw.js"></script>
    <script>
        DSW.setup()
            .then(function(){
                // inform the user your page works offline, now!
            })
            .catch(function(){
                // do something if the page will not work offline
                // or if the current browser does not support it
            });
    </script>
```

3) Now, for any change in your Dynamic Service Worker configuration, just run(in your project's root directory):

```dsw```

You can also use `dsw path-to-your/project`.<br/>
This will generate the `webapp.manifest` and `dsw.js` files in your project's root directory.

4) For every new change or version, you will have to run `dsw` again, so it will generate the updated service worker file.<br/>
This will create the `manifest` (if not there, already) and the `dsw.js` file.

To do so, if you installed it globally:

```dsw path-to-your/project```

If you installed locally, though:

```node node_modules/dsw/bin [path-to-your-project]```

This second example is specially useful if you intend to run it in a stand alone project or want to trigger it using a script in your `package.json` file.

From now on, let's work as if you had installed it globally in our examples.

Now, let's set up your project's offline configuration.

When you change something in your `dswfile.json`, you shall re-execute the command above.

## Configuring it

Open the `dswfile.json` in the root of your project and let's add some content like this:

```js
{
    "dswVersion": 2.2,
    "applyImmediately": true,
    "dswRules": {
        "yourRuleName": {
            "match": { },
            "apply": { }
        }
    }
}
```

That's it! You may have many rules.
Reminding that `applyImmediately` is optional. It will replace the previously registered service worker as soon as the new one loads.

### Matching

The `match` property accepts an _Object_ or an _Array_ or objects with the following configuration:

- status: An array with the matching statuses (eg.: [404, 500])
- extension: A string or an array of matching extensions (eg.: ["html", "htm", "php"])
- path: A regular expression (cast in a string, so JSON can treat it)

When used as an object, multiple properties are used as "AND". For exampe:

```js
match: {
    extension: ['html', 'htm'],
    status: [404, 500]
}
```

Will match requests with a `status` equals to 404 or 500, **AND** with an extension of `html or htm`.<br/>
While:
```js
match: [
    { extension: ['html', 'htm'] },
    { patch: 'some-dir\/' }
]
```

Will match all requests with an extension of `html or htm`, **OR** in the `some-dir/` path (no matter the extension, then).

Please notice that requests for different domains will become `opaque`.

This means they will work, but may be cached with a bad status.
This avoids the famous CORS errors, but exposes you to the chances of having them
with the wrong cached data(if it failed in the first time the user loaded it).

### Strategy

The strategy tells DSW how to deal with different situations for a request lifecycle.
It may be:

- **offline-first** [default]: Will look first for the content in cache and retrieve it. If it is not there, will try and fetch it. Then, stores it in the cache.
- **online-first**: Will _ALWAYS_ go for the network and see it can load the content. If so, adds(or updates) it into cache(if cache is meant to be applied). If it fails fetching it, only then it will look for it in the cache.
- **fastest**: Will try **both** the network and the cache. The first to resolve will be used. The advantage is that once it has loaded from the network, it will update the cache, this way, the user always sees the last or the second last versions, and the cache keeps up to date. The disadvantage here, is that it always opens a network request.

### Applying

The `apply` property for each rule is used when a request matches the `match` requirements.
It may be:

- fetch: The (string)path to be loaded instead of the original request
- redirect: same as fetch, but setting the header status to 302
- cache: An object containing cache information for the request
- output: String, accepting the use of variables ($1, $2, etc) to be the response itselfe
- bypass: Will **not** treat the request anyhow, neither the response.<br.>Accepts the values `request` (will go for the network, and if it fails, will output an empty string) or `ignore` (will always output an empty string).

#### Cache

DSW will treat the cache layer for you.

Pass to the cache object in your apply definition, an object containing:

- name (mandatory, although a default name will be used if this is not passed)
- version (optional)
- expires (optional)

You can also define `cache: false`. This will force the request **not to be cached**.
Seens silly, but is useful when you want an exception for your cached data.

Expires is a number in mileseconds or a string with the pattern:

- x seconds: `xs`
- x minutes: `xm`
- x hours: `xh`
- x days: `xd`
- x weeks: `xw`
- x months: `xM`
- x years: `xy`

By default, caches wont expire...ever! Only when the cache version changes.<br/>
When expired, DSW will look for the up to date content and will update it into the cache.<br/>
Although, if it fails retrieving the updated data, it will still use the previously cached data, until it manages to get the updated content.

#### IndexedDB

Some times, you will request a _JSON_ and IndexedDB is the best way to store it.

To do so, you will use the `indexedDB` action in your `apply` rule.
Pass an object containing the following:

- name: The name of your IndexedDB
- version(optional): The version of your IndexedDB structure
- key: The name of the key, for the indexed data
- indexes: An array with everything you want to use as index.

Indexes may be a _String_ or an object containing:

- path: The path where to find the index in your object
- name(optional): The name of the index (if not sent, path will be used as the name)
- options(optional): Any options you want to set to your index (like `unique` or `multiEntry`)

For example:

```js
"apply": {
    "indexedDB": {
        "name": "userData",
        "version": "3",
        "key": "id",
        "indexes": [
            "age",
            {
                "name": "twitter",
                "path": "twitter",
                "options": {
                    "unique": true
                }
            }
        ]
    }
}
```

In this example, we will have three indexes: age, twitter and id (created automatically as it is the key).

If you **DO NOT** want to cache your json stored in IndexedDB, set `cache: false` in your rule/apply configuration.

**How it works**

You may be wondering how it caches your data.
Well, it uses the `cacheApi` to store as requests, only your keys. When you try to use it, it will use these ids to find the stored data you want, in your indexedDB.

This way, you can access the information in your IndexedDB by yourself, while your requests will automatically deal with it, too.

### Tracing and debugging

Yes, you can debug your configuration and trace requests!<br/>
The API for that is quite simple and very powerful.

```js
DSW.trace('/some/matching-pattern', function(data){
    console.log(data);
});
```

This is it. Now, any request that matches `/some/matching-pattern` will be sent to your callback function with all the trace information.<br/>
This data includes all the steps and different states your requests have been through. This way you validate and debug your rules.

# Examples

Using both `match` and `apply`, we can do a lot of things.<br/>
Don't forget to re-run `dsw path-to-project` whenever you made a change to your `dswfile.js` file.

#### Treating not found pages (404)

Add this to your `dswfile.js`:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "notFoundPages": {
            "match": {
                "status": [404],
                "extension": ["html"]
            },
            "apply": {
            	"fetch": "/my-404-page.html"
            }
        }
    }
}
```

Create a `my-404-page.html` with any content.

Now, access in your browser, first, the `index.html` file(so the service worker will be installed), then any url replacing the `index.html` string, and you will see your `my-404-page.html` instead.

#### Caching data

Let's see an example of requests being cached:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "myCachedImages": {
            "match": {
                "extension": ["png", "jpg", "gif"]
            },
            "apply": {
            	"cache": {
            		"name": "my-cached-images",
            		"version": 1
            	}
            }
        }
    }
}
```

#### Dealing with cache exceptions(cache: false)

Let's see an example of requests being cached for *all images* except one specific image:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "myNotCachedImage": {
            "match": {
                "path": "\/images\/some-specific-image"
            },
            "apply": {
            	"cache": false
            }
        },
        "myCachedImages": {
            "match": {
                "extension": ["png", "jpg", "gif"]
            },
            "apply": {
            	"cache": {
            		"name": "my-cached-images",
            		"version": 1
            	}
            }
        }
    }
}
```

#### Redirecting an URL

You may want to redirect requests some times, like so:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "secretPath": {
            "match": {
                "path": "\/private\/"
            },
            "apply": {
            	"redirect": "/not-allowed.html"
            }
        }
    }
}
```

#### Using variables

You can apply actions using variables from your regular expression, like this:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "redirectWithVar": {
            "match": {
                "path": "\/old-site\/(.*)"
            },
            "apply": {
                "redirect": "/redirected.html?from=$1"
            }
        }
    }
}
```

#### Caching EVERYTHING

Maybe you want to cache everything. Every single request (that is successful) will be cached as soon as it is loaded the first time:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "cacheAll": {
            "match": {
                "path": "\/.*"
            },
            "apply": {
            	"cache": {
            	    "name": "cached-files"
            	    "version": 1
            	}
            }
        }
    }
}
```

#### Caching your static files

Most of times you will want to cache all your static files, like _javascript_ files or _css_:

```js
{
    "dswVersion": 2.2,
    "dswRules": {
        "statics": {
            "match": {
                "extension": ["js", "css"]
            },
            "apply": {
            	"cache": {
            	    "name": "page-static-files"
            	    "version": 1
            	}
            }
        }
    }
}
```

#### Sending credentials

In case you want to send credentials or other settings to fetch, you can use the `options` property.

```js
{
    "dswVersion": 2.2,
    "dswRules": {
	"userData": {
        "match": { "path": "\/api\/user\/.*" },
        "options": { "credentials": "same-origin"},
        "apply": {
            // apply somethig
        }
    }
}
```

#### Sending credentials

In case you want to send credentials or other settings to fetch, you can use the `options` property.

```js
{
    "dswVersion": 2.2,
    "dswRules": {
	"userData": {
        "match": { "path": "\/api\/user\/.*" },
        "options": { "credentials": "same-origin"},
        "strategy": "online-first",
        "apply": {
            "indexedDB": {
                "name": "userData",
                "version": "3",
                "key": "id",
                "indexes": [
                    "name",
                    {
                        "name": "twitter",
                        "path": "twitter",
                        "options": {
                            "unique": true
                        }
                    }
                ]
            }
        }
    }
}
```

### Using it programatically

You can also use it programatically, specially if you intend to use or create a tool to build, like `grunt` or `gulp`.

```js
const options = {};
let dsw = requier('dsw');
dsw.generate('./path-to-project', options);
```

### Using the API

There is a client API as well, so you can use some features with aliases and shortcuts with the DSW client API.

#### Notifications

You can enable notifications (the user will be asked to give permissions).<br/>
To do that, you can use the `DSW.enableNotifications()` method, which will return a promise that resolves when the user enables it, and rejects if the user denies the permission.

```js
DSW.enableNotifications().then(function(){
    console.log('notification was shown');
}).catch(function(reason){
    console.log('Did not show the notification:', reason);
});
```

You can also show a notification using the `DSW.notify` method.<br/>
This method will ask for permissions in case the user hasn't enabled it yet.

```js
DSW.notify('The title', {
    body: 'The message content',
    icon: 'https://raw.githubusercontent.com/NascHQ/dsw/master/docs/images/worker-person.png',
    duration: 5
}).then(function(){
    console.log('notification was shown');
}).catch(function(reason){
    console.log('Did not show the notification:', reason);
});
```

#### Connection status

You can use the methods `DSW.online` and `DSW.offline` to know if the device has internet connection*.<br/>
Also, you can use the method `DSW.onNetworkStatusChange` to know WHEN the connection status changes.

```js
DSW.onNetworkStatusChange(function(connected){
    if (connected) {
        console.log('Was offline and is now online');
    } else {
        console.log('Was online and is now offline');
    }
});
```

* This depends on browser support...some browser will say the device is online even though there is no internet connection, just because the device is connected to a private network(with a rounter).

## Sandbox

Want to just see it working as fast as possible?<br/>
Clone the project, go to its directory, install it and run `npm run try`

# Contributing

So, you want to contribute? Cool! We need it! :)

Here is how...and yep, as Service workers are still a little too new, it is a little bit weird! Here is how I've been doing this, and if you have any better suggestion, please let me know :)

1 - Clone the project

```git clone https://github.com/NascHQ/dsw```

2 - Enter the project directory and install it

```
cd dsw
npm install
```

3 - Start watching it

```npm run watch```

4 - Use the sandbox to test it (run this command in another terminal window or tab, so the watch command can continue running)

```npm run try```

5 - Access in the browser, the address in the right port, as provided by the previous command, something like:

`http://localhost:8888/`

Please notice we use `eslint` to validate the code styles. You can see the rules in the `.eslintrc.js` file.

### Testing your changes

Whenever you change any files inside the `src` directory, the _watch_ will re-build it for you (wait until you see the **"DONE"** output).

This is automatic, but you stillneed to reload the _try_ command in the other tab:

```
^C # ctrl+C to stop the previous try, and then...
npm run try
```

### Tips

In the browser, though, you may face some boring situations, so, to make sure you will not fall into a trap debugging unchanged things, here goes some tips:

- Go to the settings of your browser console and enable the "disable cache(when console is open)". This way, you will not be tricked by some unwanted caches.

- Go to the _"Application"_ tab in your console (in chrome, it is in canary by now) and:

1 - Click in _"Service workers"_

2 - Mark the box _"Show All"_ (and when there is more than one, you may click in "Unregister")

3 - You can also check the box "Update on reload" to keep the latest service worker in command.

4 - When you want to test how things are working offline, simply check the "Offline" box.

5 - You can use the "Cache Storage" in the left panel to verify everything that has been cached.

6 - You can use the Lighthouse to validate the service worker situation: [Lighthouse](https://chrome.google.com/webstore/detail/lighthouse/blipmdconlkpinefehnmjammfjpmpbjk?hl=en)

### Help by commenting(or reporting on issues)

If you have an idea or suggestion, please let us know by creating an issue at [DSW Github](https://github.com/NascHQ/dsw) Project page.

#### Browser support

Service workers have been adopted by browsers and you can see an updated list here:<br/>
[isServiceWorkerReady?](https://jakearchibald.github.io/isserviceworkerready/)

#### Related projects

Some other projects that might help you too.

- [Lighthouse](https://github.com/GoogleChrome/lighthouse) - Validates your service worker and manifest for Progressive Web App
- [SW-Toolbox](https://github.com/GoogleChrome/sw-toolbox) - A collection of tools for service workers
- [SW-Precache](https://github.com/GoogleChrome/sw-precache) - Precaches specific resources





