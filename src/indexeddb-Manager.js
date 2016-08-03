
const DEFAULT_DB_NAME = 'defaultDSWDB';
const INDEXEDDB_REQ_IDS = 'indexeddb-id-request';
const dbs = {};
var cacheManager;

function getObjectStore(dbName, mode='readwrite') {
    let db = dbs[dbName],
        tx = db.transaction(dbName, mode);
    return tx.objectStore(dbName);
}

const indexedDBManager = {
    setup (cm) {
        cacheManager = cm;
    },
    create (config) {
        return new Promise((resolve, reject)=>{
            
            let request = indexedDB.open(config.name || DEFAULT_DB_NAME,
                        parseInt(config.version, 10) || undefined);
    
            function dataBaseReady (db, dbName, resolve) {
                db.onversionchange = function(event) {
                    db.close();
                    console.log('There is a new version of the database(IndexedDB) for '+
                                config.name);
                };
                
                if (!dbs[dbName]) {
                    dbs[dbName] = db;
                }
                
                resolve(config);
            }
            
            request.onerror = function(event) {
                reject('Could not open the database (indexedDB) for ' + config.name);
            };
            
            request.onupgradeneeded = function(event) {
                let db = event.target.result;
                let baseData = {};
                
                if (config.indexes) {
                    baseData.keyPath = config.indexes;
                }
                if (!config.indexes || config.autoIncrement) {
                    baseData.autoIncrement = true;
                }
                if (config.version) {
                    baseData.version = config.version;
                }else{
                    baseData.version = 1;
                }
                
                if (event.oldVersion && event.oldVersion < baseData.version) {
                    // in case there already is a store with that name
                    // with a previous version
                    db.deleteObjectStore(config.name);
                } else if (event.oldVersion === 0) {
                    // if it is the first time it is creating it
                    db.createObjectStore(config.name, baseData);
                }
                
                dataBaseReady(db, config.name, resolve);
            };
            
            request.onsuccess = function(event) {
                var db = event.target.result;
                dataBaseReady(db, config.name, resolve);
            };
        });
    },
    
    get (dbName, request) {
        return new Promise((resolve, reject)=>{
            let store = getObjectStore(dbName);
            // TODO: look for cached keys, then find them in the db
            caches.match(request)
                .then(result=>{
                    if(result) {
                        result.json().then(obj=>{
                            // if the request was in cache, we now have got
                            // the id=value for the indexes(keys) to look for,
                            // in the indexedDB!
                            debugger;
                            let store = getObjectStore(dbName),
                                req;
                            // TODO: select here, by index
                            store.index();
                            resolve();
                        });
                    }else{
                        resolve();
                    }
                });
        });
    },
    
    save (dbName, data, request, rule) {
        return new Promise((resolve, reject)=>{

            data.json().then(obj=>{
                
                let store = getObjectStore(dbName),
                    req;
                
                req = store.add(obj);

                req.onsuccess = function () {
                    
                    debugger;
                    let tmp = {};
                    let indexes = rule.action.indexedDB.indexes || ['id'];
                    indexes.forEach(cur=>{
                        tmp[cur] = obj[cur];
                    });
                    
                    cacheManager.put(INDEXEDDB_REQ_IDS,
                        request,
                        new Response(JSON.stringify(tmp),
                            {
                                headers: { 'Content-Type' : 'application/json' }
                            })
                    );
                    resolve();
                };
                req.onerror = function(event) {
                    reject('Failed saving to the indexedDB!', this.error);
                };
            }).catch(err=>{
                console.error('Failed saving into indexedDB!\n', err.message, err);
                reject('Failed saving into indexedDB!');
            });
        });
    }
    
};

export default indexedDBManager;
