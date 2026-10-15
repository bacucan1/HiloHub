import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = resolve(
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    || resolve(scriptDirectory, '../../firebase-admin-tools/service-account.json')
);
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (error) {
  console.error(`No se pudo leer la cuenta de servicio en ${serviceAccountPath}.`, error);
  process.exit(1);
}

const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
if (projectId !== serviceAccount.project_id) {
  console.error('FIREBASE_PROJECT_ID no coincide con el project_id de la cuenta de servicio.');
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
    || `https://${projectId}-default-rtdb.firebaseio.com`
});

const createdAt = Date.now();
const communities = [
  {
    id: 'programacion',
    name: 'programacion',
    category: 'Tecnología',
    description: 'Comparte proyectos, resuelve dudas y conversa sobre desarrollo de software.'
  },
  {
    id: 'diseno-ux',
    name: 'diseno-ux',
    category: 'Diseño',
    description: 'Diseño de producto, investigación UX, accesibilidad y sistemas de diseño.'
  },
  {
    id: 'aprendizaje',
    name: 'aprendizaje',
    category: 'Educación',
    description: 'Estrategias, recursos y hábitos para aprender algo nuevo cada día.'
  },
  {
    id: 'emprendimiento',
    name: 'emprendimiento',
    category: 'Negocios',
    description: 'Ideas, experiencias y consejos prácticos para construir proyectos.'
  },
  {
    id: 'lectura',
    name: 'lectura',
    category: 'Cultura',
    description: 'Recomendaciones, clubes de lectura y conversaciones sobre libros.'
  },
  {
    id: 'bienestar',
    name: 'bienestar',
    category: 'Estilo de vida',
    description: 'Rutinas sostenibles, equilibrio y bienestar para la vida cotidiana.'
  }
];

const sampleUsers = [
  { uid: 'demo_marina_lopez', displayName: 'Marina López', email: 'marina.lopez@example.invalid' },
  { uid: 'demo_diego_ramos', displayName: 'Diego Ramos', email: 'diego.ramos@example.invalid' },
  { uid: 'demo_lucia_martin', displayName: 'Lucía Martín', email: 'lucia.martin@example.invalid' },
  { uid: 'demo_andres_vega', displayName: 'Andrés Vega', email: 'andres.vega@example.invalid' },
  { uid: 'demo_sofia_reyes', displayName: 'Sofía Reyes', email: 'sofia.reyes@example.invalid' },
  { uid: 'demo_pablo_cruz', displayName: 'Pablo Cruz', email: 'pablo.cruz@example.invalid' },
  { uid: 'demo_valeria_soto', displayName: 'Valeria Soto', email: 'valeria.soto@example.invalid' },
  { uid: 'demo_mateo_flores', displayName: 'Mateo Flores', email: 'mateo.flores@example.invalid' },
  { uid: 'demo_elena_torres', displayName: 'Elena Torres', email: 'elena.torres@example.invalid' },
  { uid: 'demo_nicolas_gil', displayName: 'Nicolás Gil', email: 'nicolas.gil@example.invalid' },
  { uid: 'demo_camila_ruiz', displayName: 'Camila Ruiz', email: 'camila.ruiz@example.invalid' },
  { uid: 'demo_javier_molina', displayName: 'Javier Molina', email: 'javier.molina@example.invalid' }
];

const samplePosts = [
  ['programacion-01', '¿Qué proyecto pequeño te ayudó a aprender más?', 'Estoy buscando ideas para practicar que se puedan terminar en un fin de semana. ¿Qué proyecto te enseñó algo que todavía usas?', 'programacion', 'demo_marina_lopez'],
  ['programacion-02', 'Cómo organizan sus proyectos personales', 'Me cuesta mantener el foco cuando empiezo varias cosas a la vez. ¿Qué sistema sencillo usan para avanzar sin complicarlo?', 'programacion', 'demo_diego_ramos'],
  ['diseno-ux-01', '¿Cómo validan una idea antes de diseñarla?', 'Estoy probando entrevistas breves con usuarios. ¿Qué preguntas les han servido para descubrir problemas reales?', 'diseno-ux', 'demo_lucia_martin'],
  ['diseno-ux-02', 'Recursos para mejorar la accesibilidad', '¿Qué herramientas o listas de comprobación recomiendan para revisar contraste y navegación con teclado?', 'diseno-ux', 'demo_andres_vega'],
  ['aprendizaje-01', 'Un hábito de estudio que sí lograste mantener', 'Busco formas realistas de estudiar después del trabajo. ¿Qué rutina pequeña te funcionó a largo plazo?', 'aprendizaje', 'demo_sofia_reyes'],
  ['aprendizaje-02', 'Cómo repasar sin releer apuntes', 'Estoy explorando la repetición espaciada y la práctica activa. ¿Qué método les resulta más fácil de sostener?', 'aprendizaje', 'demo_pablo_cruz'],
  ['emprendimiento-01', '¿Cómo consiguieron sus primeros usuarios?', 'Me interesa conocer acciones concretas y de bajo presupuesto para validar un producto nuevo.', 'emprendimiento', 'demo_valeria_soto'],
  ['emprendimiento-02', 'Qué aprendieron de su primer lanzamiento', '¿Qué cambiarían si pudieran volver al día en que publicaron su primer producto?', 'emprendimiento', 'demo_mateo_flores'],
  ['lectura-01', '¿Qué libro recomendarían a alguien que quiere volver a leer?', 'Busco algo accesible y entretenido para recuperar el hábito sin empezar por una lista enorme.', 'lectura', 'demo_elena_torres'],
  ['lectura-02', 'Cómo organizan un club de lectura pequeño', 'Estamos pensando en reunirnos una vez al mes. ¿Qué dinámica hace que participe todo el mundo?', 'lectura', 'demo_nicolas_gil'],
  ['bienestar-01', 'Una rutina corta para desconectar al terminar el día', '¿Qué hacen para dejar atrás el trabajo y descansar sin depender del teléfono?', 'bienestar', 'demo_camila_ruiz'],
  ['bienestar-02', 'Ideas para moverse un poco más durante la semana', 'Busco opciones amables que pueda incorporar a días ocupados. ¿Qué les funciona?', 'bienestar', 'demo_javier_molina']
];

const database = getDatabase();
try {
  for (const community of communities) {
    const communityRef = database.ref(`communities/${community.id}`);
    await communityRef.transaction((existing) => existing ?? { ...community, createdAt, memberCount: 0 });
  }

  for (const user of sampleUsers) {
    const userRef = database.ref(`users/${user.uid}`);
    await userRef.transaction((existing) => existing ?? {
      displayName: user.displayName,
      email: user.email,
      role: 'user'
    });
  }

  for (const [index, [id, title, body, community, authorId]] of samplePosts.entries()) {
    const author = sampleUsers.find((user) => user.uid === authorId);
    if (!author) {
      throw new Error(`No se encontró el perfil de ejemplo "${authorId}" para la publicación "${id}".`);
    }
    const postRef = database.ref(`posts/${id}`);
    await postRef.transaction((existing) => {
      if (!existing) {
        return {
          title,
          body,
          community,
          authorId,
          authorName: author.displayName,
          score: 0,
          commentCount: 0,
          createdAt: createdAt - index * 60_000,
          isDemo: true
        };
      }
      if (existing.authorId === 'hilohub-demo') {
        return { ...existing, authorId, authorName: author.displayName, isDemo: true };
      }
      return;
    });
  }
} finally {
  await app.delete();
}

console.log(
  `Seed completado sin duplicar registros en ${projectId}: ` +
  `${communities.length} comunidades, ${samplePosts.length} publicaciones y ${sampleUsers.length} perfiles de ejemplo.`
);
