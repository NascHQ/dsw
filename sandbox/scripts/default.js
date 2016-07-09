console.log('LOADED THE SCRIPT');

window.addEventListener('load', function(){
    
    document.getElementById('btn-img-1').addEventListener('click', function(){
        document.getElementById('test-image').setAttribute('src', 'images/public/gears.png');
    });
    
    document.getElementById('btn-img-2').addEventListener('click', function(){
        document.getElementById('test-image').setAttribute('src', 'images/public/something.png');
    });
    
    document.getElementById('btn-img-3').addEventListener('click', function(){
        document.getElementById('test-image').setAttribute('src', 'images/legacy-images/foo.png');
    });
    
    document.getElementById('btn-img-4').addEventListener('click', function(){
        document.getElementById('test-image').setAttribute('src', 'images/not-cached.jpg');
    });
    
    document.getElementById('btn-img-5').addEventListener('click', function(){
        fetch('/api/user/1.json').then(function(response){
            response.text().then(function(text){
                document.getElementById('fetch-result').innerHTML = text;
            });
        });
    });
    
    document.getElementById('btn-img-6').addEventListener('click', function(){
        fetch('/api/user/2.json').then(function(response){
            response.text().then(function(text){
                document.getElementById('fetch-result').innerHTML = text;
            });
        });
    });
    document.getElementById('btn-7').addEventListener('click', function(){
        let listOfOlderPages = [
            'index.html',
            'page-1.html',
            'about.html',
            'articles.html',
            'contact.html'
        ];
        document.getElementById('redirectionFrame').src = '/old-site/' +
            listOfOlderPages[Math.ceil(Math.random() * 5) -1];
    });
    
});