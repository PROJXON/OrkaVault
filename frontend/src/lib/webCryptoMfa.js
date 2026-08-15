/**
 * Web Crypto & IndexedDB Helper for MFA Device Registration and Challenge Signing
 */

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("OrkaVaultMFA", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("keys")) {
        db.createObjectStore("keys");
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Save private key securely in IndexedDB
 */
export async function savePrivateKey(deviceId, privateKey) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    const store = tx.objectStore("keys");
    const request = store.put(privateKey, deviceId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve private key from IndexedDB
 */
export async function getPrivateKey(deviceId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readonly");
    const store = tx.objectStore("keys");
    const request = store.get(deviceId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete private key from IndexedDB
 */
export async function deletePrivateKey(deviceId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keys", "readwrite");
    const store = tx.objectStore("keys");
    const request = store.delete(deviceId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generate a new EC cryptographic key pair for the device.
 * Stores private key in IndexedDB and returns JWK public key.
 */
export async function generateDeviceKey() {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error("Web Crypto API is not supported in this browser.");
  }

  // Generate ECDSA key pair (P-256 curve)
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false, // Private key MUST NOT be extractable/exportable
    ["sign", "verify"]
  );

  // Export the public key in JWK format to send to the server
  const jwkPublicKey = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return {
    publicKey: jwkPublicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Sign a cryptographic challenge string using the stored device private key.
 * Returns signature as a hex string.
 */
export async function signChallenge(deviceId, challenge) {
  const privateKey = await getPrivateKey(deviceId);
  if (!privateKey) {
    throw new Error("Device private key not found locally. Please log in with TOTP.");
  }

  const encoder = new TextEncoder();
  const challengeBuffer = encoder.encode(challenge);

  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    privateKey,
    challengeBuffer
  );

  // Convert ArrayBuffer signature to Hex string
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
