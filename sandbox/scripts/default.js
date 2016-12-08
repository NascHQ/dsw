console.log('LOADED THE SCRIPT');

window.addEventListener('DOMContentLoaded', function(){

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

    let testMode = false;

    // this is just an alias for us to write less
    function set (el, attr, src) {
        el[attr] = '';
        el[attr] = src;
    }
    // alias for getElementById
    function geby (id) {
        return document.getElementById(id);
    }

    function showClickAt (el) {
        const clickClass = 'just-clicked';
        el.classList.add(clickClass);
        el.focus();
        setTimeout(_=>{
            el.classList.remove(clickClass);
        }, 1000);
    }

    const tests = {
        "#btn-img-1": function(){
            return new Promise((resolve, reject)=>{
                let el = geby('test-1-image');
                let url = 'images/public/gears.png';
                el.onload = _=>{resolve(location.protocol+'//'+location.host+'/'+url);};
                el.onerror = _=>{reject(_);};
                showClickAt(geby('btn-img-1'));
                set(el, 'src', url);
            });
        },
        "#btn-img-2": function(){
            return new Promise((resolve, reject)=>{
                let el = geby('test-2-image');
                let url = 'images/public/something.png';
                el.onload = _=>{resolve(location.protocol+'//'+location.host+'/'+url);};
                el.onerror = _=>{reject(_);};
                showClickAt(geby('btn-img-2'));
                set(el, 'src', url);
            });
        },
        "#btn-img-3": function(){
            return new Promise((resolve, reject)=>{
                let el = geby('test-3-image');
                let url = 'images/legacy-images/foo.png';
                el.onload = _=>{resolve(location.protocol+'//'+location.host+'/'+url);};
                el.onerror = _=>{reject(_);};
                showClickAt(geby('btn-img-3'));
                set(el, 'src', url);
            });
        },
        "#btn-img-4": function(){
            return new Promise((resolve, reject)=>{
                let el = geby('test-4-image');
                let url = 'images/not-cached.jpg';
                el.onload = _=>{resolve(location.protocol+'//'+location.host+'/'+url);};
                el.onerror = _=>{reject(_);};
                showClickAt(geby('btn-img-4'));
                set(el, 'src', url);
            });
        },
        "#btn-5-page": function(){
            return new Promise((resolve, reject)=>{
                let el = geby('test-5-iframe');
                let url = 'foo.html';
                el.onload = _=>{resolve(location.protocol+'//'+location.host + url);};
                el.onerror = _=>{reject(_);};
                showClickAt(geby('btn-5-page'));
                set(el, 'src', url);
            });
        },
        "#btn-6-data": function(){
            let i = testMode? 1: Math.ceil(Math.random()*3);
            return new Promise((resolve, reject)=>{
                let el = geby('test-6-iframe');
                let url = 'api/user/'+i+'.json';
                el.onload = _=>{resolve(location.protocol+'//'+location.host + url);};
                el.onerror = reject;
                showClickAt(geby('btn-6-data'));
                set(el, 'src', url);
            });
        },
        "#btn-7-page": function(){
            return new Promise((resolve, reject)=>{
                let listOfOlderPages = [
                    'index.html',
                    'page-1.html',
                    'about.html',
                    'articles.html',
                    'contact.html'
                ];
                let el = geby('test-7-iframe');
                let idx = testMode? 2: Math.ceil(Math.random() * 5) -1;
                let url = 'old-site/' + listOfOlderPages[idx];
                el.onload = _=>{resolve(location.protocol+'//'+location.host + url);};
                el.onerror = reject;
                showClickAt(geby('btn-7-page'));
                set(el, 'src', url);
            });
        },
        "#btn-8-video": function(){
            geby('iframe-embeded-video')
                .setAttribute('src', 'https://www.youtube.com/embed/AgZJQT1-ixg?autoplay=1');
        },
        "#btn-9-video": function(){
            var videoEl = geby('video-test');
            videoEl.setAttribute('src', 'videos/dsw-video-sandbox.mp4');
            videoEl.play();
        },
        "#btn-11-iframe": function(){
            var videoEl = geby('iframe-preload-bundle');
            videoEl.setAttribute('src', 'purchase-page/kart.html');
        }
    };

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
    geby('btn-img-1').addEventListener('click', tests['#btn-img-1']);

    geby('btn-img-2').addEventListener('click', tests['#btn-img-2']);

    geby('btn-img-3').addEventListener('click', tests['#btn-img-3']);

    geby('btn-img-4').addEventListener('click', tests['#btn-img-4']);

    geby('btn-5-page').addEventListener('click', tests['#btn-5-page']);

    geby('btn-6-data').addEventListener('click', tests['#btn-6-data']);

    geby('btn-7-page').addEventListener('click', tests['#btn-7-page']);

    geby('btn-8-video').addEventListener('click', tests['#btn-8-video']);

    geby('btn-9-video').addEventListener('click', tests['#btn-9-video']);

	geby('btn-10-message').addEventListener('click', function(){
		var el = this;
        el.parentNode.querySelector('.test-content').innerHTML = 'sending...';
        sendMessage().then(_=>{
        	el.parentNode.querySelector('.test-content').innerHTML = 'Message Sent';
        }).catch(err=>{
        	el.parentNode.querySelector('.test-content').innerHTML = 'Message Failed';
        });
    });

    geby('btn-11-iframe').addEventListener('click', tests['#btn-11-iframe']);

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

//    // some requests that should bypass...you will only see them on your console
//    setTimeout(_=>{
//        fetch('/api/bypass/log.js').then(response=>{
//            response.text().then(content=>{
//                console.log(content);
//            });
//        });
//        setTimeout(_=>{
//            fetch('/ignore/index.html').then(response=>{
//                response.text().then(content=>{
//                    console.log(content);
//                });
//            });
//        }, 1000);
//    }, 3000);


    /*
    This is used to run unit tests, mainly
    */
    (()=>{
        window.addEventListener('message', function messageReceived (event) {

            var answerMessage = function (result) {
                event.ports[0].postMessage(result || {});
            }

            var command = null;

            if (!event.data) {
                return;
            }
            var command = event.data.DSWCommand;
            if (!command){
                return;
            }

            if (command.dswUnderAutomatedTest) {
                // starting the sandbox page in test mode
                DSW.trace(/.*/, function traceReceived (data) {
                    event.ports[0].postMessage({ trace: data });
                });
                testMode = true;
                document.body.classList.add('test-mode');
                setTimeout(_=>{
                    answerMessage({ acknowledged: true });
                }, 2000);
                return;
            }

            if (command.get) {
                switch (command.get) {
                    case 'dswStatus': {
                        answerMessage(DSW.status);
                        break;
                    }
                    case 'readyEvent': {
                        DSW.ready.then(event=>{
                                answerMessage({ status: DSW.status });
                            })
                            .catch(err=>{
                                answerMessage({ err: err });
                            });
                        break;
                    }
                }
                return;
            }

            // it should execute a task (one of the functions in tests)
            if (command.exec) {
                switch(command.exec) {
                    case 'click':
                        tests[command.target]()
                            .then(result=>{
                                answerMessage({
                                    status: true,
                                    result: {
                                        url: result
                                    }
                                });
                            })
                            .catch(err=>{
                                answerMessage({
                                    status: false,
                                    err: err.message || 'Failed testing ' + command.target
                                });
                            });
                        break;
                    case 'unregister':
                        DSW.unregister().then(result=>{
                            answerMessage({
                                status: true,
                                result: {
                                    unregistered: true
                                }
                            });
                        }).catch(reason=>{
                            answerMessage({
                                status: false,
                                result: {
                                    unregistered: false,
                                    reason: reason
                                }
                            });
                        });
                        break;
                    default:
                        break;
                }
            }
        });
    })();

});
