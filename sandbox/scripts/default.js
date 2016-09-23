console.log('LOADED THE SCRIPT');

window.addEventListener('load', function(){

    // using the api to know when the browser connection status changes
    DSW.onNetworkStatusChange(function(connected){
        let projectStatusEl = document.querySelector('.project-status');
        let statusLabelEl = geby('online-offline-status');
        if (connected) {
            projectStatusEl.style.display = 'block';
            statusLabelEl.classList.add('green');
            statusLabelEl.classList.remove('red');
        } else {
            projectStatusEl.style.display = 'none';
            statusLabelEl.classList.add('red');
            statusLabelEl.classList.remove('green');
        }
        statusLabelEl.querySelector('.test-container span').innerHTML = connected? 'ONLINE': 'OFFLINE';
    });

    // this is just an alias for us to write less
    function set (el, attr, src) {
        el[attr] = '';
        el[attr] = src;
    }
    // alias for getElementById
    function geby (id) {
        return document.getElementById(id);
    }

    // the "ask for notification permission" button
    geby('enable-notif-btn').addEventListener('click', function(event){
        var el = this;
        var parentEl = el.parentNode.parentNode;

        if (DSW.online()) {
            DSW.enableNotifications()
                .then(function(subscriber){
                    el.value = 'ENABLED';
                    parentEl.classList.add('green');
                    parentEl.classList.remove('red');
                }).catch(reason=>{
                    el.value = 'DENIED';
                    parentEl.classList.add('red');
                    parentEl.classList.remove('green');
                });
        } else {
            el.value = 'MUST BE CONNECTED';
            parentEl.classList.remove('red');
            parentEl.classList.remove('blue');
            parentEl.classList.remove('green');
            parentEl.classList.add('orange');
        }
    });

    // adding the listeners for our tests
    geby('btn-img-1').addEventListener('click', function(){
        set(geby('test-1-image'), 'src', 'images/public/gears.png');
    });

    geby('btn-img-2').addEventListener('click', function(){
        set(geby('test-2-image'), 'src', 'images/public/something.png');
    });

    geby('btn-img-3').addEventListener('click', function(){
        set(geby('test-3-image'), 'src', 'images/legacy-images/foo.png');
    });

    geby('btn-img-4').addEventListener('click', function(){
        set(geby('test-4-image'), 'src', 'images/not-cached.jpg');
    });

    geby('btn-5-page').addEventListener('click', function(){
        set(geby('test-5-iframe'), 'src', '/foo.html');
    });
    geby('btn-6-data').addEventListener('click', function(){
        let i = Math.ceil(Math.random()*3);
        set(geby('test-6-iframe'), 'src', '/api/user/'+i+'.json');
    });
    geby('btn-7-page').addEventListener('click', function(){
        let listOfOlderPages = [
            'index.html',
            'page-1.html',
            'about.html',
            'articles.html',
            'contact.html'
        ];
        let idx = Math.ceil(Math.random() * 5) -1;
        set(geby('test-7-iframe'), 'src', '/old-site/' +
            listOfOlderPages[idx]);
    });

    geby('btn-8-video').addEventListener('click', function(){
        geby('iframe-embeded-video')
            .setAttribute('src', 'https://www.youtube.com/embed/AgZJQT1-ixg?autoplay=1');
    });

    geby('btn-9-video').addEventListener('click', function(){
        var videoEl = geby('video-test');
        videoEl.setAttribute('src', 'videos/dsw-video-sandbox.mp4');
        videoEl.play();
    });

	geby('btn-10-message').addEventListener('click', function(){
		var el = this;
        el.parentNode.querySelector('.test-content').innerHTML = 'sending...';
        sendMessage().then(_=>{
        	el.parentNode.querySelector('.test-content').innerHTML = 'Message Sent';
        }).catch(err=>{
        	el.parentNode.querySelector('.test-content').innerHTML = 'Message Failed';
        });
    });

	function sendMessage () {
		return new Promise((resolve, reject)=>{
            DSW.enableNotifications().then(_=>{
                if (DSW.status.notification) {
                    fetch('https://fcm.googleapis.com/fcm/send', {
                        "method": "POST",
                        "Authorization": "key=AIzaSyDrxZHHEF6EMOH2UbgT31ymj8Fe8Sy8d_8",
                        "mode": "cors",
                        "body": JSON.stringify({
                            registration_ids: [ DSW.status.notification.replace(/.+\/gcm\/send\//, '') ]
                        }),
                        headers: {
                            "Content-Type":"application/json",
                            "Authorization": "key=AIzaSyDrxZHHEF6EMOH2UbgT31ymj8Fe8Sy8d_8"
                        }
                    }).then(response=>{
                        console.log(response.status, response.statusText);
    //					response.text().then(function(result){
    //						console.log(result);
    //					});
                        resolve();
                    }).catch(err=>{
                        console.warn('Could not send the message', err);
                        reject(err);
                    });
                } else {
                    reject('Notification not allowed by the user');
                }
            }).catch(err=>{
                reject('Notification not registered');
            });
		});
	}

    // some requests that should bypass...you will only see them on your console
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
