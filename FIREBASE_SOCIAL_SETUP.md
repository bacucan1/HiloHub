# Configuracion Firebase para InfoHub

## 1. Authentication

En Firebase Console > Authentication > Sign-in method:

- Habilita Google.
- Mantén habilitado Email/Password si se usará el registro por correo.
- Añade los dominios web que uses en Authentication > Settings > Authorized domains.
- En la app Android `io.ionic.starter`, registra las huellas SHA-1 y SHA-256 del keystore debug y release.
- Descarga el `google-services.json` actualizado en `android/app/google-services.json`.

## 2. Realtime Database

La app usa Realtime Database, no Firestore. Publica las reglas incluidas en `database.rules.json`:

```bash
firebase login
firebase use crudpmovil
firebase deploy --only database
```

Si el proyecto todavía no está inicializado en Firebase CLI, ejecuta `firebase init database` y conserva el archivo `firebase.json` de este proyecto.

La estructura esperada es:

```text
users/{uid}
  displayName: string
  role: "user"

posts/{postId}
  title: string
  body: string
  community: string
  authorId: string
  authorName: string
  score: number
  commentCount: number
  createdAt: number

comments/{postId}/{commentId}
votes/{postId}/{uid}: 1 | -1
communities/{communityId}
```

## 3. Roles

Los roles no deben guardarse ni cambiarse desde el cliente. Asígnalos con Firebase Admin SDK como custom claims:

```js
await getAuth().setCustomUserClaims(uid, { role: 'moderator' });
```

Roles disponibles:

- `user`: puede publicar, comentar y votar.
- `moderator`: además puede eliminar publicaciones y comentarios.
- `admin`: puede administrar moderadores y comunidades.

Después de cambiar un rol, el usuario debe cerrar sesión y volver a entrar, o forzar la renovación del token. Las reglas consultan `auth.token.role`.

## 4. Datos iniciales

No uses `infos/` para las publicaciones nuevas. El feed lee `posts/`. Los registros antiguos no se muestran hasta migrarlos a la estructura `posts/{postId}`.

## 5. Producción

El cliente mantiene `score` y `commentCount` como datos desnormalizados para que el feed sea rápido. Para una versión pública, mueve esos agregados a Cloud Functions y valida límites, reportes, bloqueo de usuarios y moderación desde backend.
