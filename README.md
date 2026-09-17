# HiloHub

HiloHub es una red social móvil tipo Reddit construida con Ionic, Angular, Capacitor y Firebase. Permite publicar en comunidades, votar, comentar y moderar contenido mediante roles.

## Funcionalidades

- Autenticación con correo, contraseña y Google.
- Login de Google nativo en Android mediante Capacitor.
- Feed de publicaciones ordenado por fecha.
- Comunidades identificadas como `r/comunidad`.
- Votos positivos y negativos.
- Comentarios por publicación.
- Roles `user`, `moderator` y `admin`.
- Reglas de Realtime Database para proteger publicaciones, comentarios y votos.

## Requisitos

- Node.js 20 o superior.
- Java JDK 21 para compilar Android.
- Ionic CLI y Capacitor 8.
- Firebase CLI para publicar reglas.
- Un proyecto Firebase con Authentication y Realtime Database habilitados.

## Instalación

```powershell
npm install
npm start
```

La aplicación web estará disponible en `http://localhost:8100`.

Para validar una compilación de producción:

```powershell
npm run build
```

## Configuración de Firebase

En Firebase Console:

1. Habilita Google y Email/Password en Authentication.
2. Crea o habilita Realtime Database.
3. Añade los dominios web autorizados.
4. Registra la aplicación Android con el paquete `io.ionic.starter`.
5. Añade las huellas SHA-1 y SHA-256 de los certificados debug y release.
6. Descarga `google-services.json` y colócalo en `android/app/google-services.json`.

Publica las reglas incluidas en este proyecto:

```powershell
firebase login
firebase use crudpmovil
firebase deploy --only database
```

La estructura principal de datos es:

```text
users/{uid}
posts/{postId}
comments/{postId}/{commentId}
votes/{postId}/{uid}
communities/{communityId}
```

Las publicaciones nuevas deben usar `posts/`. La ruta antigua `infos/` pertenece al CRUD original y no forma parte del feed social.

## Roles y autorización

Los roles se asignan como custom claims desde Firebase Admin SDK. El cliente no debe poder modificar su propio rol.

Entra en la carpeta administrativa e instala la dependencia:

```powershell
cd firebase-admin-tools
npm install firebase-admin
```

Coloca la clave privada de una cuenta de servicio en:

```text
firebase-admin-tools/service-account.json
```

Asigna un rol individual:

```powershell
node set-role.mjs UID_COMPLETO user
node set-role.mjs UID_COMPLETO moderator
node set-role.mjs UID_COMPLETO admin
```

O reparte aleatoriamente un `admin`, un `moderator` y `user` al resto:

```powershell
node assign-random-roles.mjs UID_1 UID_2 UID_3 UID_4
```

Roles disponibles:

- `user`: publica, comenta y vota.
- `moderator`: también puede eliminar contenido.
- `admin`: administra moderadores y comunidades.

Después de modificar un rol, el usuario debe cerrar sesión y volver a entrar para renovar su token.

## Android

Sincroniza el proyecto y abre Android Studio:

```powershell
npm run build
npx cap sync android
npx cap open android
```

El login nativo requiere `google-services.json`, las huellas del certificado Android y Google habilitado como proveedor de Firebase Authentication.

## Seguridad

- Nunca subas `service-account.json` a Git.
- Nunca incluyas credenciales de Admin SDK en la aplicación Ionic.
- Las reglas de `database.rules.json` son la autoridad final; las comprobaciones de la interfaz solo mejoran la experiencia.
- Para producción, mueve el cálculo de votos y contadores a Cloud Functions y añade reportes, bloqueo de usuarios y límites antispam.

## Archivos importantes

- `src/app/social/social.service.ts`: publicaciones, comentarios y votos.
- `src/app/auth/role.service.ts`: lectura del rol desde custom claims.
- `database.rules.json`: autorización de Realtime Database.
- `FIREBASE_SOCIAL_SETUP.md`: configuración detallada de Firebase.
- `firebase-admin-tools/`: scripts administrativos para asignar roles.
