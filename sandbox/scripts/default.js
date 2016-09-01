console.log('LOADED THE SCRIPT');

window.addEventListener('load', function(){
    
    function set (el, attr, src) {
        el[attr] = '';
        el[attr] = src;
    }
    
    document.getElementById('btn-img-1').addEventListener('click', function(){
        set(document.getElementById('test-1-image'), 'src', 'images/public/gears.png');
    });
    
    document.getElementById('btn-img-2').addEventListener('click', function(){
        set(document.getElementById('test-2-image'), 'src', 'images/public/something.png');
    });
    
    document.getElementById('btn-img-3').addEventListener('click', function(){
        set(document.getElementById('test-3-image'), 'src', 'images/legacy-images/foo.png');
    });
    
    document.getElementById('btn-img-4').addEventListener('click', function(){
        set(document.getElementById('test-4-image'), 'src', 'images/not-cached.jpg');
    });
    
    document.getElementById('btn-5-page').addEventListener('click', function(){
        set(document.getElementById('test-5-iframe'), 'src', '/foo.html');
    });
    document.getElementById('btn-6-data').addEventListener('click', function(){
        let i = Math.ceil(Math.random()*3);
        set(document.getElementById('test-6-iframe'), 'src', '/api/user/'+i+'.json');
    });
    document.getElementById('btn-7-page').addEventListener('click', function(){
        let listOfOlderPages = [
            'index.html',
            'page-1.html',
            'about.html',
            'articles.html',
            'contact.html'
        ];
        let idx = Math.ceil(Math.random() * 5) -1;
        console.log(idx);
        set(document.getElementById('test-7-iframe'), 'src', '/old-site/' +
            listOfOlderPages[idx]);
    });
    
    setTimeout(_=>{
        fetch('/api/bypass/log.js').then(_=>{
            _.text().then(content=>{
                console.log(content);
            });
        });
        setTimeout(_=>{
            fetch('/ignore/index.html').then(_=>{
                _.text().then(content=>{
                    console.log(content);
                });
            });
        }, 1000);
    }, 3000);
    
});