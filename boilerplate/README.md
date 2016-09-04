## DSW Boilerplate

To start out of nothing, simply run:

```
sh steps.sh
```

It is based in 5 simple steps, you can see the `steps.sh` content and run them manually, too.

These are the steps:

```html
# Step 1 (only once, for all projects):  Install DSW
npm install -g dsw

#Step 2: Create the basic dswfile.json
echo '{
  "dswRules": {
  }
}'>dswfile.json

# Step 3: Write the HTML basics in index.html
<link rel="manifest" href="/webapp-manifest.json">
<meta name="theme-color" content="#color">

# Step 4: Use the dsw script in your index.html
<script src="dsw.js"></script>
<script>
    DSW.setup()
       .then(function(){ /* */ })
       .catch(function(){ /* */ });
</script>

# Step 5(repeatable): Generate (or update) the Service Worker (run dsw in your terminal)
dsw

# Start a server to see it working
http-server
