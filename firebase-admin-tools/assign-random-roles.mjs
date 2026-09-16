import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const userPrefixes = process.argv.slice(2).filter(Boolean);

if (userPrefixes.length === 0) {
  console.error('Uso: node assign-random-roles.mjs UID_O_PREFIJO_1 UID_O_PREFIJO_2 ...');
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(readFileSync('./service-account.json', 'utf8')))
});

const auth = getAuth();
const allUsers = [];
let pageToken;

do {
  const page = await auth.listUsers(1000, pageToken);
  allUsers.push(...page.users);
  pageToken = page.pageToken;
} while (pageToken);

const users = userPrefixes.map((prefix) => {
  const matches = allUsers.filter((user) => user.uid.startsWith(prefix));

  if (matches.length !== 1) {
    throw new Error(`El prefijo ${prefix} coincide con ${matches.length} usuarios; usa un prefijo más largo.`);
  }

  return matches[0];
});

const roles = users.map((_, index) => {
  if (index === 0) return 'admin';
  if (index === 1) return 'moderator';
  return 'user';
});

for (let index = roles.length - 1; index > 0; index -= 1) {
  const swapIndex = randomInt(index + 1);
  [roles[index], roles[swapIndex]] = [roles[swapIndex], roles[index]];
}

for (const [index, user] of users.entries()) {
  await auth.setCustomUserClaims(user.uid, { role: roles[index] });
  console.log(`${user.email ?? user.uid}: ${roles[index]}`);
}

console.log('Roles aleatorios asignados. Los usuarios deben cerrar sesión y volver a entrar.');
