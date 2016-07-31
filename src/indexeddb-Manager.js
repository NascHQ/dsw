
const DEFAULT_DB_NAME = 'defaultDSWDB';
const dbs = {};

function getObjectStore(dbName, mode='readwrite') {
    let db = dbs[dbName],
        tx = db.transaction(dbName, mode);
    return tx.objectStore(dbName);
}

const indexedDBManager = {
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
            //let store = getObjectStore(dbName);
            resolve();
        });
    },
    
    save (dbName, data) {
        return new Promise((resolve, reject)=>{

            data.json().then(obj=>{
                
                let store = getObjectStore(dbName),
                    req;
                
                req = store.add(obj);

                req.onsuccess = function () {
                    resolve();
                };
                req.onerror = function(event) {
                    reject('Failed saving to the indexedDB!', this.error);
                };
            }).catch(err=>{
                console.error('Failed saving into indexedDB!\n', err.message, err);
                reject('Failed saving into indexedDB!');
            });
            
            console.log(dbName, data);
        });
    }
    
};

export default indexedDBManager;
