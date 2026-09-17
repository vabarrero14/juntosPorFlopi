# Prompt: Juntos por Flopi — Web de eventos y donaciones

## Contexto

Florencia ("Flopi"), de 2 años, fue diagnosticada con leucemia y está en
tratamiento. Su familia y su comunidad vienen organizando eventos (rifas,
ferias, colectas de sangre, bonos contribución, etc.) para acompañarla, y hoy
esa información se comparte de forma dispersa en una cuenta de Instagram.

El objetivo de este proyecto es construir una web ("Juntos por Flopi") que
centralice toda esa información en un solo lugar, con foco en:

1. Mostrar los eventos organizados por distintas personas/organizaciones en un
   **calendario interactivo** (estilo visual similar a Google Calendar).
2. Permitir que cualquiera **proponga un evento propio**, sujeto a aprobación.
3. Tener una **sección de donaciones** para captar más donantes.
4. Dar a la familia/organizadores un **panel de administración simple**
   (tipo WordPress admin, pero minimalista) para cargar, editar, aprobar y
   borrar eventos y contenido.

## Stack tecnológico

- **Frontend**: HTML + CSS + JavaScript (vanilla o con un bundler liviano tipo
  Vite si conviene para organizar el código; sin frameworks pesados salvo que
  se decida lo contrario más adelante).
- **Backend / datos**: Firebase
  - **Firestore** como base de datos (eventos, donaciones, usuarios admin).
  - **Firebase Authentication** para el login del panel de administración
    (email/password, o Google Sign-In restringido a una allowlist de emails).
  - **Firebase Hosting** para publicar el sitio (luego se conecta el dominio
    propio comprado por el usuario).
  - **Firebase Storage** para imágenes de eventos y del sitio (flyers, fotos).
  - **Firestore Security Rules** para que:
    - Cualquiera pueda leer eventos **aprobados**.
    - Cualquiera pueda **crear** una propuesta de evento (queda en estado
      `pending`), pero no pueda aprobarse a sí misma ni editar eventos ajenos.
    - Solo usuarios autenticados con rol admin puedan aprobar/editar/borrar.

## Estructura de datos (Firestore)

### Colección `events`

```
{
  id: string (auto),
  title: string,                // nombre del evento
  description: string,
  organizer: string,             // nombre del organizador/institución
  organizerContact: string,      // teléfono / instagram / email (opcional)
  date: timestamp,               // fecha y hora de inicio
  endDate: timestamp | null,     // opcional, para eventos de varios días
  location: {
    address: string,
    city: string,
    mapsUrl: string | null,      // link a Google Maps (o lat/lng)
  },
  category: string,              // ej: "rifa", "colecta de sangre", "feria", "bono contribución", "otro"
  imageUrl: string | null,       // flyer del evento (Storage)
  status: "pending" | "approved" | "rejected",
  submittedBy: {
    name: string,
    email: string,
    phone: string | null,
  },
  createdAt: timestamp,
  reviewedAt: timestamp | null,
  reviewedBy: string | null,     // uid del admin que aprobó/rechazó
  rejectionReason: string | null,
}
```

### Colección `donations` (info de donación, no transacciones)

```
{
  id: string,
  type: "banco" | "mercadopago" | "alias" | "billetera" | "caja_chica" | "otro",
  title: string,                 // ej: "Transferencia bancaria"
  details: string,               // CBU/alias/link, texto libre
  active: boolean,
  order: number,                 // para ordenar en la UI
}
```

### Colección `admins`

```
{
  uid: string,       // uid de Firebase Auth
  email: string,
  role: "owner" | "editor",
}
```

### Colección `siteContent` (opcional, para textos editables desde el admin)

```
{
  id: "home" | "about" | "flopi_story",
  title: string,
  body: string,        // markdown o texto enriquecido
  updatedAt: timestamp,
}
```

## Páginas y secciones del sitio público

1. **Home**
   - Hero con foto/nombre de Flopi, mensaje corto, y llamados a la acción:
     "Ver calendario de eventos", "Donar", "Proponer un evento".
   - Resumen de próximos 3-4 eventos.
   - Link a Instagram y redes existentes.

2. **Calendario de eventos** (vista principal del proyecto)
   - Vista mensual tipo grilla (similar a Google Calendar) con los eventos
     ubicados en el día correspondiente.
   - Click en un día/evento abre un **modal o panel de detalle** con: nombre,
     fecha y hora, lugar/dirección (con link a Google Maps), organizador,
     descripción, imagen/flyer, categoría.
   - Filtros por categoría (rifa, colecta de sangre, feria, etc.) y por
     ciudad/zona si aplica.
   - Alternativa/complemento: vista de **lista cronológica** para mobile,
     donde la grilla de calendario es menos usable.
   - Solo se muestran eventos con `status = approved`.

3. **Historia de Flopi / Sobre la causa**
   - Texto editable desde el admin (colección `siteContent`), fotos, estado
     del tratamiento si la familia decide compartirlo.

4. **Donaciones**
   - Listado de formas de donar (banco, alias, Mercado Pago, etc.) leídas de
     la colección `donations`, con botón de copiar alias/CBU.
   - Mensaje claro de a quién/qué organización van destinados los fondos.

5. **Proponer un evento**
   - Formulario público: nombre del evento, descripción, fecha/hora, lugar,
     dirección, organizador, contacto, categoría, imagen opcional.
   - Al enviarse, crea un documento en `events` con `status: "pending"`.
   - Mensaje de confirmación: "Tu evento fue enviado y será revisado antes de
     publicarse".
   - Validaciones básicas (campos obligatorios, fecha no pasada, formato de
     contacto).

## Panel de administración (`/admin`)

- Login con Firebase Auth, acceso restringido a documentos en `admins`.
- **Dashboard**: contador de eventos pendientes, próximos eventos, total de
  eventos aprobados.
- **Gestión de eventos**:
  - Tabla/lista con filtros por estado (pendiente / aprobado / rechazado).
  - Acciones: aprobar, rechazar (con motivo opcional), editar, eliminar,
    destacar (opcional, para resaltar un evento en el home).
  - Formulario de alta/edición manual de eventos (para que el admin cargue
    eventos directamente, sin pasar por el formulario público).
- **Gestión de donaciones**: alta/edición/orden/activar-desactivar los medios
  de donación.
- **Gestión de contenido**: edición simple de los textos de "Sobre la causa" /
  Home (similar a editar una página en WordPress, con un textarea o editor
  simple tipo markdown).
- **Gestión de administradores** (solo rol `owner`): agregar/quitar emails con
  acceso al panel.

## Ideas adicionales a considerar

- **Compartir evento**: botón para compartir un evento puntual por WhatsApp /
  redes, generando un link directo (`/evento/:id`).
- **Recordatorios**: opción de "agregar a mi calendario" (descarga `.ics`) por
  evento.
- **Feed de Instagram embebido** en el home, para no perder el contenido ya
  publicado ahí mientras se migra la costumbre a la web.
- **Galería de eventos pasados** con fotos, para mostrar el impacto y generar
  confianza en nuevos donantes/organizadores.
- **Mapa general** con todos los eventos próximos geolocalizados (Google Maps
  embed), útil si hay eventos en distintas ciudades/barrios.
- **Voluntariado**: sección simple para que alguien se ofrezca a ayudar
  (armar rifas, difundir, logística), con un formulario similar al de
  eventos.
- **Notificación al admin**: cuando se crea un evento pendiente, disparar un
  email (Firebase Extensions "Trigger Email" o Cloud Function) al admin para
  que no tenga que estar revisando manualmente todo el tiempo.
- **SEO básico** y **Open Graph tags** por evento, para que al compartir en
  WhatsApp/redes se vea bien la tarjeta con imagen y descripción.
- **Analítica simple** (Firebase Analytics) para saber cuántas personas
  entran, qué eventos se ven más, de dónde vienen las visitas.

## Fases sugeridas de desarrollo

1. **Fase 1 — Base**: setup de Firebase (Firestore, Auth, Hosting, Storage),
   estructura del proyecto, home estático, historia de Flopi.
2. **Fase 2 — Calendario**: vista de calendario mensual + detalle de evento,
   leyendo eventos aprobados desde Firestore (se puede arrancar con datos de
   ejemplo cargados a mano).
3. **Fase 3 — Formulario público** de propuesta de evento + colección
   `pending`.
4. **Fase 4 — Panel admin**: login, aprobar/editar/borrar eventos, gestión de
   donaciones y contenido.
5. **Fase 5 — Donaciones y pulido**: sección de donaciones, compartir por
   WhatsApp, `.ics`, SEO/OG tags, analytics.
6. **Fase 6 — Publicación**: conectar dominio propio a Firebase Hosting.

## Resultado esperado de este prompt

Un sitio web publicado con Firebase que centralice la información de Flopi,
muestre todos los eventos en un calendario interactivo tipo Google Calendar,
permita a la comunidad proponer nuevos eventos (con aprobación previa),
recaude más donaciones, y sea mantenible por la familia a través de un panel
de administración simple, sin depender de un desarrollador para cada cambio
de contenido.
