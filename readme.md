# Dynamic Service Worker
![Dynamic Service Worker](https://raw.githubusercontent.com/NascHQ/dsw/master/docs/images/worker-person.png)

[![Version](https://img.shields.io/npm/v/dsw.svg?label=Version&maxAge=2592000)](https://www.npmjs.com/package/dsw)
[![Codacy Badge](https://api.codacy.com/project/badge/Grade/bb589aedc04b445d9633ddf66b55da06)](https://www.codacy.com/app/felipenmoura/dsw?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=NascHQ/dsw/&amp;utm_campaign=Badge_Grade) 
[![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg)](https://raw.githubusercontent.com/NascHQ/dsw/master/license.txt) 
[![GitHub issues](https://img.shields.io/github/issues/NascHQ/dsw.svg)](https://github.com/NascHQ/dsw/issues) 
[![Build Status](https://travis-ci.org/NascHQ/dsw.svg)](https://travis-ci.org/NascHQ/dsw) 

DSW allows you to enable and use Service Workers in a much easier way, also helping you to create and maintain your Progressive Web Apps working offline.<br/>
You will simply have to create setup in a JSON file how your service worker is supposed to deal with requests. Read the [commented JSON example](https://naschq.github.io/dsw/config-example.html) or the documentation and examples below.

## Live Demo

You can access this page and see a live demo of DSW working.
After loading the page the first time, it will install the service worker. When opening it the second time, it will cache everything following its rules (described in each block and link).
You can then go offline and reload the page to validate it.
[Dynamic Service Worker demo](https://dsw-demo-rwnwbdjrxg.now.sh/)

## Advantages

- use of variables
- decision over cache naming and versioning for each matching request
- many named rules (for future debugging tooling...I imagine we can have a lighthouse-like page for debugging your service workers and your rules)
- support for indexedDB (under development)
- support for messaging and syncing events (under development)
- quite simple json configuration and easy to start with the basic, or go further for more complex cases
- client api with many possibilities (kinda connecting the browser and sw scopes via events)

## Installing it

It's node program which you may install globally:

```npm install -g dsw```

Or locally:

```npm install dsw --save-dev```

## TL;DL

Want simply to see it working as fast as possible?<br/>
Clone the project, go to its directory, install it and run `npm run try`

## Using it

DSW will look for a file called `dswfile.json`. So:

```
cd path-to-your-project
touch dswfile.json
```

You will use your prefered editor to make changes to this file later.

And now, you will add this to your `index.html` file, like so, in the `head` element:

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

Done! Now, for any change in your Dynamic Service Worker configuration, just run again the `dsw` command line on your project.<br/>
This will create the `manifest` (if not there, already) and the `dsw.js` file.

To do so, if you installed it globally:

```dsw path-to-your-project```

If you installed locally, though:

```node node_modules/dsw/ path-to-your-project```

This second example is specially useful if you intend to run it in a stand alone project or want to trigger it using a script in your `package.json` file.

From now on, let's work as if you had installed it globally in our examples.

You will notice a `dsw.js` file that has been created in your project's root path.

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

### Strategy

The strategy tells DSW how to deal with different situations for a request lifecycle.
It may be:

- **offline-first** [default]: Will look first for the content in cache and retrieve it. If it is not there, will try and fetch it. Then, stores it in the cache.
- **online-first**: Will _ALWAYS_ go for the network and see it can load the content. If so, adds(or updates) it into cache(if cache is meant to be applied). If it fails fetching it, only then it will look for it in the cache.

### Applying

The `apply` property for each rule is used when a request matches the `match` requirements.
It may be:

- fetch: The (string)path to be loaded instead of the original request
- redirect: same as fetch, but setting the header status to 302
- cache: An object containing cache information for the request

#### Cache information

DSW will treat the cache layer for you.

Pass to the cache object in your apply definition, an object containing:

- name (mandatory, although a default name will be used if this is not passed)
- version (optional)

You can also define `cache: false`. This will force the request **not to be cached**.

Seens silly, but is useful when you want an exception for your cached data.

# Examples

Using both `match` and `apply`, we can for do a lot of things.<br/>
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

#### Use it programatically

You can also use it programatically, specially if you intend to use or create a tool to build, like `grunt` or `gulp`.

```js
const options = {};
let dsw = requier('dsw');
dsw.generate('./path-to-project', options);
```

# Contributing

So, you want to contribute? Cool! We need it! :)

Here is how...and yep, as Service workers are still a little too new, it is a little bit weird! Here is how I've been doing this, and if you have any better suggestion, please let me know :)

1 - Clone the project

```git clone https://github.com/NascHQ/dsw```

2 - Enter the project directory

```cd dsw```

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

#### Related projects

Some other projects that might help you too.

- [Lighthouse](https://github.com/GoogleChrome/lighthouse) - Validates your service worker and manifest for Progressive Web App
- [SW-Toolbox](https://github.com/GoogleChrome/sw-toolbox) - A collection of tools for service workers
- [SW-Precache](https://github.com/GoogleChrome/sw-precache) - Precaches specific resources




