console.log('LOADED THE SCRIPT');

window.addEventListener('load', function(){
    setTimeout(function(){
        document.getElementById('foo-image').setAttribute('src', 'images/public/gears.png');
    }, 2000);
});