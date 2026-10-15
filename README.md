# HiloHub

HiloHub es una red social móvil tipo Reddit construida con Ionic, Angular, Capacitor y Firebase. Permite publicar en comunidades, votar, comentar y moderar contenido mediante roles.

## Funcionalidades

- Autenticación con correo, contraseña y Google.
- Login de Google nativo en Android mediante Capacitor.
- Feed de publicaciones ordenado por fecha.
- Comunidades con descubrimiento, categorías, búsqueda y suscripción.
- Feed filtrado por las comunidades que sigue cada usuario.
- Bandeja de notificaciones internas y notificaciones push por dispositivo.
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
communitySubscriptions/{uid}/{communityId}
communitySubscribers/{communityId}/{uid}
notifications/{uid}/{postId}
notificationDevices/{uid}/{deviceId}
subscriptions/{uid}
```

## Comunidades y notificaciones

La pantalla `/communities` permite buscar comunidades por nombre, descripción o categoría, consultar sus publicaciones recientes y seguirlas o dejar de seguirlas. El feed incluye una vista **Mis comunidades**. `/notifications` muestra avisos internos, permite marcarlos como leídos y gestionar las notificaciones push del dispositivo actual.

Las membresías se mantienen en `communitySubscriptions/{uid}/{communityId}` y un índice inverso en `communitySubscribers/{communityId}/{uid}` permite a Cloud Functions encontrar suscriptores sin recorrer todas las cuentas. Los contadores de miembros se actualizan en el servidor. Al crearse un post nuevo, Functions crea una notificación en `notifications/{uid}/{postId}` y envía push a los dispositivos registrados en `notificationDevices/{uid}/{deviceId}`. El cliente solo puede marcar como leídas sus propias notificaciones; no puede crear ni modificar avisos.

### Cargar ejemplos de comunidades

El seeder inserta seis comunidades, doce publicaciones y doce perfiles ficticios vinculados a sus publicaciones. Los perfiles no son cuentas de Firebase Authentication y no permiten iniciar sesión. Las publicaciones de ejemplo se marcan con `isDemo` para que el trigger de nuevas publicaciones no envíe notificaciones a los usuarios reales. Es idempotente: no duplica ni sobrescribe registros existentes; solo repara el autor de publicaciones de ejemplo antiguas con el UID compartido `hilohub-demo`. Ejecútalo manualmente contra el proyecto Firebase que corresponde a la cuenta de servicio; no se ejecuta desde la app ni durante el despliegue:

```powershell
npm --prefix functions install
$env:FIREBASE_PROJECT_ID = "ID_DEL_PROYECTO"
$env:FIREBASE_DATABASE_URL = "https://ID_DEL_PROYECTO-default-rtdb.firebaseio.com"
npm --prefix functions run seed:communities
```

Coloca `service-account.json` en `firebase-admin-tools/` antes de ejecutar el script. Si tu archivo tiene otro nombre o está en otra ruta, define `FIREBASE_SERVICE_ACCOUNT_PATH` con la ruta completa antes de correrlo. La cuenta de servicio debe pertenecer al mismo proyecto y tener acceso de administrador a Realtime Database. Verifica el proyecto y la URL antes de correrlo, especialmente si se usa una base de datos regional con una URL distinta.

### Configurar notificaciones push

1. Despliega las reglas y funciones, que deben estar activas antes de que nuevas publicaciones puedan generar avisos:

   ```powershell
   firebase deploy --only database,functions
   ```

   Las funciones de Realtime Database requieren una base de datos habilitada y un proyecto Firebase con el plan de facturación que permita Cloud Functions.
2. En Firebase Console, habilita Firebase Cloud Messaging. En **Configuración del proyecto → Cloud Messaging**, genera o consulta el par de claves Web Push y copia únicamente la clave pública a `notifications.vapidKey` en `src/environments/environment.ts` y `src/environments/environment.prod.ts`. No incluyas la clave privada en el frontend.
3. Para web, publica la app mediante HTTPS (localhost también está permitido por los navegadores) y asegúrate de que `firebase-messaging-sw.js` se sirve desde la raíz del dominio. El usuario debe aceptar el permiso del navegador desde **Notificaciones**.
4. Para Android, configura `google-services.json` en `android/app/`, habilita Cloud Messaging en Firebase y sincroniza el plugin:

   ```powershell
   npm run build
   npx cap sync android
   ```

   Para iOS, configura Firebase y APNs en Apple Developer/Firebase, añade la app iOS y ejecuta `npx cap sync ios`. Push nativo no estará operativo hasta completar esos pasos de plataforma.
5. Ejecuta el seeder de comunidades si aún no hay comunidades. La notificación push e interna se genera para publicaciones nuevas, no para publicaciones que ya existían antes del despliegue.

## Suscripciones con PayPal

La página `/subscription` ofrece tres planes mensuales de ejemplo. Los botones de pago permanecen deshabilitados hasta que se configure PayPal; no se debe usar el precio de ejemplo para cobrar sin crear planes equivalentes en PayPal.

1. En PayPal Developer, crea una aplicación REST en Sandbox y copia su Client ID.
2. Crea tres productos/planes de suscripción mensuales en USD. Configura sus importes y copia los Plan ID.
3. Sustituye `clientId` y los `paypalPlanId` en `src/environments/environment.ts` y `src/environments/environment.prod.ts`. Ajusta también nombres, importes de ejemplo y moneda para que coincidan con los planes.
4. Configura las credenciales privadas del mismo entorno en Firebase Functions:

   ```powershell
   firebase functions:secrets:set PAYPAL_CLIENT_ID
   firebase functions:secrets:set PAYPAL_CLIENT_SECRET
   ```

   `PAYPAL_ENVIRONMENT` usa `sandbox` de forma predeterminada. Al desplegar, Firebase solicitará los tres valores `PAYPAL_PLAN_ESSENTIAL`, `PAYPAL_PLAN_PLUS` y `PAYPAL_PLAN_COMMUNITY`, que deben coincidir con los configurados en la app.
5. Despliega inicialmente para obtener la URL HTTPS de la función `paypalSubscriptionWebhook`:

   ```powershell
   firebase deploy --only functions,database
   ```

6. En PayPal Developer, registra esa URL como webhook y activa `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.UPDATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED` y `BILLING.SUBSCRIPTION.SUSPENDED`.
7. Guarda el Webhook ID generado en `functions/.env.<id-del-proyecto>` como `PAYPAL_WEBHOOK_ID=...` y vuelve a desplegar las funciones. Para producción, añade `PAYPAL_ENVIRONMENT=production` al archivo de entorno correspondiente y configura allí los Plan ID y credenciales de producción correctos.

La app solo presenta al usuario como suscripción activa después de que la función `verifyPaypalSubscription` consulte directamente a PayPal y compruebe estado, plan e identidad. El webhook valida la firma con PayPal y actualiza cancelaciones y cambios de estado. Los registros están en `subscriptions/{uid}` (lectura solo del titular; escritura solo del servidor). Configura por separado los secretos de Sandbox y producción y no publiques nunca el Secret ni el Webhook ID en la app.

Las publicaciones nuevas deben usar `posts/`. La ruta antigua `infos/` pertenece al CRUD original y no forma parte del feed social.

## Roles y autorización

Los roles se asignan como custom claims desde Firebase Admin SDK; el perfil de Realtime Database solo refleja ese permiso y no es su autoridad. La app actualiza los roles desde una Cloud Function que exige un custom claim `admin`. El cliente no puede asignarse ni cambiarse su propio rol. Después de un cambio, el usuario afectado debe renovar su sesión para cargar el nuevo permiso.

Para asignar el primer rol `admin`, usa el script administrativo de bootstrap. Entra en la carpeta administrativa e instala la dependencia:

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

Una vez desplegadas las funciones, el selector de administración actualiza el custom claim y el perfil. Los scripts de bootstrap hacen lo mismo para el primer administrador.

## Moderación local con Ollama

Las publicaciones se revisan en la red local con Ollama y el modelo `llama-guard3:1b`. El título y el texto no se envían a OpenAI ni a otro servicio externo. La revisión se ejecuta antes de guardar; si el modelo no está disponible, la app no publica.

1. Instala Ollama en el computador que alojará el modelo.
2. En PowerShell, descarga el modelo:

   ```powershell
   ollama pull llama-guard3:1b
   ```

3. Permite conexiones desde los dispositivos de tu red privada y desde los orígenes locales de la app. Cierra y vuelve a abrir Ollama después de cambiar variables:

   ```powershell
   setx OLLAMA_HOST "0.0.0.0:11434"
   setx OLLAMA_ORIGINS "http://localhost:4200,http://127.0.0.1:4200,http://localhost:8100,http://127.0.0.1:8100,http://localhost,https://localhost"
   setx OLLAMA_NO_CLOUD "true"
   ```

4. En Windows, si el firewall bloquea la conexión, crea una regla privada limitada a la red local desde PowerShell como administrador:

   ```powershell
   New-NetFirewallRule -DisplayName "HiloHub Ollama LAN" -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Allow -Profile Private -RemoteAddress LocalSubnet
   ```

5. Inicia sesión como `moderator` o `admin`, abre una publicación y despliega **Configurar conexión local** para guardar y probar la dirección de Ollama. Esta configuración se comparte desde `moderation/ollamaEndpoint`; en Android, usa la IP privada del computador (por ejemplo, `http://192.168.1.20:11434`) y asegúrate de que el teléfono y el computador estén conectados a la misma red. Los demás roles solo pueden usar la configuración; no pueden modificarla.

No expongas el puerto 11434 a Internet ni configures redirección de puertos en el router. Las reglas de Realtime Database permiten cambiar la dirección solo a usuarios con custom claim `moderator` o `admin`. Despliega las reglas actualizadas con `firebase deploy --only database`.

La revisión local es una ayuda antes de publicar, no una barrera de seguridad del servidor: la app cliente no puede verificar el resultado de Ollama desde Firebase. Las reglas de Firebase protegen la configuración frente a cambios de usuarios sin permisos y siguen validando identidad, propiedad, longitud y estructura de las publicaciones.

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
