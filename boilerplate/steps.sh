echo "# Step 1 (only once, for all projects):  Install DSW"
npm install -g dsw

echo "#Step 2: Create the basic dswfile.json"
echo '{
  "dswRules": {
  }
}'>dswfile.json

echo "# Step 3: Write the HTML basics"
echo '<link rel="manifest" href="/webapp-manifest.json">
<meta name="theme-color" content="#color">'>index.html

echo "# Step 4: Use the dsw script in your html file"
echo '<script src="dsw.js"></script>
<script>
    DSW.setup()
       .then(function(){ /* */ })
       .catch(function(){ /* */ });
</script>'>>index.html

echo "# Step 5(repeatable): Generate (or update) the Service Worker"
dsw
echo " DONE...dsw.js and webapp-manifest.json have been created"
echo "# Start a server to see it working"
http-server
