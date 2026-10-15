import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

const [, , uid, role] = process.argv;
const validRoles = ['user', 'moderator', 'admin'];

if (!uid || !validRoles.includes(role)) {
  console.error('Uso: node set-role.mjs UID user|moderator|admin');
  process.exit(1);
}

const serviceAccount = JSON.parse(
  readFileSync('./service-account.json', 'utf8')
);

initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
    || `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
});

const auth = getAuth();
const user = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...user.customClaims, role });
await getDatabase().ref(`users/${uid}`).update({ role });

console.log(`Rol "${role}" asignado al usuario ${uid}`);