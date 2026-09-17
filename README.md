# Juntos por Flopi

Web para centralizar los eventos solidarios y las formas de donar para
acompañar el tratamiento de Flopi. Ver el detalle completo del proyecto y las
próximas fases en [`PROMPT.md`](./PROMPT.md).

## Stack

- HTML + CSS + JavaScript sin build step (ES modules nativos del navegador).
- Firebase: Firestore (datos), Authentication (panel admin, próxima fase),
  Hosting (publicación), Storage (imágenes de eventos).
- SDK de Firebase cargado vía CDN (`https://www.gstatic.com/firebasejs/...`),
  no hace falta `npm install` para correr el sitio.

## Estructura

```
public/            # todo lo que se publica en Firebase Hosting
  index.html        # home
  calendario.html    # calendario mensual de eventos
  proponer-evento.html
  donaciones.html
  historia.html
  admin/index.html   # stub del panel de administración (Fase 4)
  css/styles.css
  js/                # módulos ES: firebase-init, events-service, etc.
firestore.rules
firestore.indexes.json
storage.rules
firebase.json
.firebaserc
```

## 1. Crear el proyecto de Firebase

1. Entrar a [Firebase Console](https://console.firebase.google.com/) y crear
   un proyecto nuevo (por ejemplo `juntos-por-flopi`).
2. Habilitar:
   - **Firestore Database** (modo producción).
   - **Authentication** → método Email/Password o Google (se usará en la
     Fase 4 para el panel admin).
   - **Storage**.
3. Agregar una **app web** dentro del proyecto y copiar el objeto de
   configuración (`apiKey`, `authDomain`, etc.).
4. Pegar esos valores en `public/js/firebase-config.js`.
5. Reemplazar `REEMPLAZAR-CON-TU-PROJECT-ID` en `.firebaserc` por el
   `projectId` real.

## 2. Cargar datos de ejemplo (mientras no existe el panel admin)

Desde Firestore Database → "Iniciar colección":

- Colección `events`: crear un documento con los campos descriptos en
  `PROMPT.md` (usar `status: "approved"` para que aparezca en el calendario).
- Colección `donations`: documentos con `active: true`, `order`, `title`,
  `details`.

## 3. Correr el sitio en local

No requiere build. Alcanza con cualquier servidor estático apuntando a
`public/`, por ejemplo:

```bash
npx serve public
# o
npx http-server public
```

También se puede usar el emulador de Hosting de Firebase:

```bash
npx firebase-tools emulators:start --only hosting
```

## 4. Deployar reglas y hosting

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,storage:rules,hosting
```

## 5. Dominio propio

Una vez comprado el dominio, se conecta desde Firebase Console → Hosting →
"Agregar dominio personalizado", y se configuran los registros DNS que
indique Firebase.

## Estado actual / próximos pasos

- ✅ Home, calendario (lectura de eventos aprobados), formulario público de
  propuesta de eventos, donaciones (lectura), historia de Flopi.
- ⏳ Panel de administración (login, aprobar/editar/borrar eventos, gestionar
  donaciones y contenido) — próxima fase, ver `PROMPT.md`.
