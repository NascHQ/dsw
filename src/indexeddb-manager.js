
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
                
                if (config.key) {
                    baseData.keyPath = config.key;
                }
                if (!config.key || config.autoIncrement) {
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
                    let objectStore = db.createObjectStore(config.name, baseData);
                    // in case there are indexes defined, we create them
                    if (config.indexes) {
                        config.indexes.forEach(index=>{
                            if (typeof index == 'string') {
                                objectStore.createIndex(index, index, {});
                            } else {
                                objectStore.createIndex(index.name,
                                               index.path || index.name,
                                               index.options);
                            }
                        });
                    }
                    // we will also make the key, an index
                    objectStore.createIndex(config.key,
                                           config.key,
                                           { unique: true });
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
            // We will actuallly look for its IDs in cache, to use them to find
            // the real, complete object in the indexedDB
            caches.match(request)
                .then(result=>{
                    if(result) {
                        result.json().then(obj=>{
                            // if the request was in cache, we now have got
                            // the id=value for the indexes(keys) to look for,
                            // in the indexedDB!
                            let store = getObjectStore(dbName),
                                index = store.index(obj.key),
                                getter = index.get(obj.value);
                            // in case we did get the content from indexedDB
                            // let's create a new Response out of it!
                            getter.onsuccess = event=>{
                                resolve(new Response(JSON.stringify(event.target.result),
                                    {
                                        headers: { 'Content-Type' : 'application/json' }
                                    })
                                );
                            };
                            getter.onerror = event=>{
                                // if we did not find it (or faced a problem) in
                                // indexeddb, we leave it to the network
                                resolve();
                            };
                        });
                    }else{
                        resolve();
                    }
                });
        });
    },
    
    find: (dbName, key, value)=>{
        return new Promise((resolve, reject)=>{
            let store = getObjectStore(dbName),
                index = store.index(key),
                getter = index.get(value);
            
            getter.onsuccess = event=>{
                resolve(event.target.result);
            };
            getter.onerror = event=>{
                reject();
            };
        });
    },
    
    addOrUpdate (obj, dbName) {
        return new Promise((resolve, reject)=>{
            let store = getObjectStore(dbName);
            let req = store.put(obj);
            req.onsuccess = function addOrUpdateSuccess () {
                resolve(obj);
            };
            req.onerror = function addOrUpdateError (err) {
                resolve(obj);
            };
        });
    },
    
    save (dbName, data, request, rule) {
        return new Promise((resolve, reject)=>{

            data.json().then(obj=>{
                
                let store = getObjectStore(dbName),
                    req;
                
                req = store.add(obj);
                
                // We will use the CacheAPI to store, in cache, only the IDs for
                // the given object
                req.onsuccess = function () {
                    let tmp = {};
                    let key = rule.action.indexedDB.key || 'id';
                    tmp.key = key;
                    tmp.value = obj[key];
                    
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
