# Juntos por Flopi

Web para centralizar los eventos solidarios y las formas de donar para
acompañar el tratamiento de Flopi. Ver el detalle completo del proyecto y las
próximas fases en [`PROMPT.md`](./PROMPT.md).

## Stack

- HTML + CSS + JavaScript sin build step (ES modules nativos del navegador).
- Firebase: Firestore (datos), Authentication con Google Sign-In (panel
  admin), Hosting (publicación), Storage (imágenes de eventos).
- SDK de Firebase cargado vía CDN (`https://www.gstatic.com/firebasejs/...`),
  no hace falta `npm install` para correr el sitio.

## Estructura

```
public/                  # todo lo que se publica en Firebase Hosting
  index.html               # home
  calendario.html          # calendario mensual de eventos
  proponer-evento.html
  donaciones.html
  historia.html
  admin/                    # panel de administración
    index.html               # login (Google Sign-In)
    dashboard.html
    eventos.html              # listar / aprobar / rechazar / editar / borrar
    evento-form.html          # crear o editar un evento
    donaciones.html
    contenido.html            # editar "Historia de Flopi"
    administradores.html      # gestionar quién tiene acceso (solo owner)
    js/                       # auth-guard, admin-nav, y un .js por pantalla
  css/styles.css
  js/                       # módulos ES: firebase-init, *-service.js, etc.
firestore.rules
firestore.indexes.json
storage.rules
firebase.json
.firebaserc
```

## 1. Crear el proyecto de Firebase

1. Entrar a [Firebase Console](https://console.firebase.google.com/) y crear
   un proyecto (o usar uno ya creado).
2. Habilitar:
   - **Firestore Database** (modo producción).
   - **Authentication** → en "Sign-in method", habilitar el proveedor
     **Google**.
   - **Storage**.
3. Agregar una **app web** dentro del proyecto (⚙️ Configuración del proyecto
   → "Tus apps") y copiar el objeto de configuración (`apiKey`,
   `authDomain`, etc.).
4. Pegar esos valores en `public/js/firebase-config.js`.
5. Reemplazar `REEMPLAZAR-CON-TU-PROJECT-ID` en `.firebaserc` por el
   `projectId` real.

## 2. Crear el primer administrador (owner)

El panel no puede crear su propio primer administrador (sería un agujero de
seguridad). Se hace una única vez a mano desde Firestore:

1. Firebase Console → Firestore Database → "Iniciar colección".
2. ID de la colección: `admins`.
3. ID del primer documento: el email exacto de la cuenta de Google que va a
   administrar el sitio (ej. `vabarreto14@gmail.com`).
4. Campos del documento:
   - `email` (string) = el mismo email.
   - `role` (string) = `owner`.
5. Guardar.

Con eso, esa cuenta ya puede entrar a `/admin` con "Ingresar con Google" y,
una vez adentro, agregar a otros administradores desde la sección
"Administradores" del panel (sin tocar Firestore de nuevo).

## 3. Cargar datos de ejemplo (opcional)

Ya no hace falta cargar eventos o donaciones a mano: una vez que el primer
admin puede entrar, todo se gestiona desde `/admin` (eventos, donaciones,
texto de "Historia de Flopi").

## 4. Correr el sitio en local

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

## 5. Deployar reglas y hosting

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,storage:rules,hosting
```

## 6. Dominio propio

Una vez comprado el dominio, se conecta desde Firebase Console → Hosting →
"Agregar dominio personalizado", y se configuran los registros DNS que
indique Firebase.

## Estado actual / próximos pasos

- ✅ Home, calendario (lectura de eventos aprobados), formulario público de
  propuesta de eventos, donaciones (lectura), historia de Flopi.
- ✅ Panel de administración: login con Google, dashboard, aprobar/rechazar/
  editar/borrar eventos, cargar eventos directamente, gestionar donaciones,
  editar el texto de "Historia de Flopi", y gestionar otros administradores.
- ⏳ Ideas para más adelante (ver `PROMPT.md`): compartir evento por
  WhatsApp, botón "agregar a mi calendario" (.ics), galería de eventos
  pasados, mapa general, voluntariado, notificación por email al admin
  cuando entra un evento pendiente, SEO/Open Graph, analytics.
