console.log('LOADED THE SCRIPT');

window.addEventListener('load', function(){
    
    document.getElementById('btn-img-1').addEventListener('click', function(){
        document.getElementById('ok-image').setAttribute('src', 'images/public/gears.png');
    });
    
    document.getElementById('btn-img-2').addEventListener('click', function(){
        document.getElementById('fail-image').setAttribute('src', 'images/public/something.png');
    });
    
    document.getElementById('btn-img-3').addEventListener('click', function(){
        document.getElementById('older-image').setAttribute('src', 'images/legacy-images/foo.png');
    });
    
});