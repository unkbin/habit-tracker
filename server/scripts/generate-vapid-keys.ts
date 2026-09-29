// Prints a new VAPID key pair for Web Push. Put them in .env (and your host's environment).
// Generate once per environment and keep them: changing keys invalidates every existing
// subscription, so everyone would have to turn notifications on again.

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.info(`VAPID_PUBLIC_KEY="${publicKey}"\nVAPID_PRIVATE_KEY="${privateKey}"`);
