import { readFileSync } from 'node:fs';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
  credential: cert(serviceAccount)
});

await getAuth().setCustomUserClaims(uid, { role });

console.log(`Rol "${role}" asignado al usuario ${uid}`);