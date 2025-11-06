const IDB_NAME = "ImgDissolverCache";
const IDB_STORE_NAME = "ImageMeshes";
let db = null;

async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 2);

    request.onupgradeneeded = (event) => {
      db = event.target.result;
      const tx = event.target.transaction;
      if (tx.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.deleteObjectStore(IDB_STORE_NAME);
      }
      db.createObjectStore(IDB_STORE_NAME, { keyPath: "domain" });
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function getCachedData(domain) {
  if (!db) await openDB();
  return new Promise((resolve) => {
    const transaction = db.transaction([IDB_STORE_NAME], "readonly");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const request = store.get(domain);

    request.onsuccess = (event) => {
      resolve(event.target.result ? event.target.result.data : null);
    };

    request.onerror = () => {
      resolve(null);
    };
  });
}

async function setCachedData(domain, data) {
  if (!db) await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IDB_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const request = store.put({ domain, data });

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function emptyCacheData() {
  if (!db) {
    await openDB();
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IDB_STORE_NAME], "readwrite");
    const store = transaction.objectStore(IDB_STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => {
      console.log(`Object store '${IDB_STORE_NAME}' cleared successfully.`);
      resolve();
    };
    request.onerror = (event) => {
      console.error("Error clearing object store:", event.target.error);
      reject(event.target.error);
    };
  });
}