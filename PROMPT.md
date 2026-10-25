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
  instagramUrl: string | null,   // link al posteo de Instagram del evento
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
  instagramUrl: string | null,   // link al posteo de Instagram relacionado
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

## Módulo de entradas y control de acceso (Flopi Fest)

Gestión interna de venta de entradas y control de ingreso para eventos
puntuales con entrada paga (el primero: "Flopi Fest", show solidario). Vive
dentro de este mismo proyecto, vinculado al evento en el calendario público,
pero con su propia página. **No integra pasarelas de pago**: los cobros se
hacen por fuera (efectivo/transferencia) y acá solo se registran.

### Roles

- **Administrador**: el `isAdmin()` que ya existe (`owner`/`editor` en
  `admins`). Ve todo, confirma transferencias, anula, configura el evento y
  ve reportes.
- **Vendedor** y **Puerta**: colección nueva `eventStaff/{email}`, login con
  Google (mismo patrón que el resto del panel, sin password aparte). En esta
  fase ambos roles tienen los mismos permisos de escritura (cargan pedidos,
  cobran, emiten entradas, cortesías, escanean, autorizan reingreso) — el
  campo `role` es solo para filtrar/mostrar en los reportes, no restringe
  acciones. Pensado para que, el día del evento, cualquiera de los dos pueda
  cubrir la venta en puerta.

### Estructura de datos (Firestore)

```
ticketEvents/{id}
  name, venue, date (Timestamp), doorsOpenTime,
  priceEarly, priceDoor, capacity, currency: "PYG",
  issuedCount,     // contador cacheado, solo se mueve con aritmética exacta
                    // validada en Rules (o libre para un admin)
  salesOpen: boolean,
  raffleEnabled: boolean, raffleItemName, rafflePrice  // rifa (sin sorteo digital,
                    // solo para registrar precio/nombre del premio)

eventStaff/{email}
  email, role: "vendedor" | "puerta", active, createdAt

orders/{id}           // pedidos
  ticketEventId, buyerName, buyerPhone,
  quantity,              // cantidad de entradas, siempre >= 1 (la entrada da
                           // derecho a comprar rifa, no se vende rifa suelta)
  channel: "anticipada" | "puerta", unitPrice, total,
  raffleQuantity,        // números de rifa comprados, puede ser 0
  raffleUnitPrice,        // precio por número al momento de la compra
  raffleNumbers: string[], // números del talonario físico entregados (se cargan
                           // después de crear el pedido, no hay sorteo digital)
  collaboration: boolean, // paga como una entrada pero en principio no va a
                           // venir -- es solo informativo: la pantalla de
                           // emisión igual permite generarle el QR por si al
                           // final decide asistir
  sellerUid, sellerEmail, status: "reserved"|"partial"|"paid"|"cancelled",
  amountConfirmedTotal, appliedPaymentIds: string[],  // ver nota abajo
  notes, createdAt

payments/{id}          // pagos — nunca se borran, solo se anulan (admin)
  orderId, amount, method: "cash"|"transfer",
  reference,            // n° de comprobante/alias, obligatorio en transferencia
  receivedByUid, receivedByEmail,
  status: "pending_confirm"|"confirmed"|"voided", voidReason,
  settled: boolean,     // "rendido" (cash), lo marca un admin
  createdAt, confirmedAt, confirmedBy

tickets/{id}            // entradas
  ticketEventId, orderId (null si es cortesía), code (random ≥128 bits, para
  el QR), shortCode, type: "paid"|"courtesy", status: "issued"|"checked_in",
  holderName, holderPhone, issuedByUid, issuedByEmail,
  checkedInAt, checkedInByUid, checkedInByEmail,
  reentryCount, createdAt

auditLog/{id}            // append-only, nadie lo edita ni borra
  actorUid, actorEmail, action, entityType, entityId, details, at
```

**Nota sobre `amountConfirmedTotal`/`appliedPaymentIds`**: un pago en efectivo
se crea ya `confirmed`, pero "aplicarlo" al pedido (sumar el monto y
recalcular `status`) es un segundo paso aparte en el cliente — Firestore
Rules valida cada escritura contra el estado de la base *antes* de la
transacción, así que la regla del pedido no puede ver el pago recién creado
en esa misma transacción. `appliedPaymentIds` evita que el mismo pago se
cuente dos veces si ese segundo paso se reintenta. Transferencias quedan
`pending_confirm` hasta que un admin las confirma contra el banco (ahí sí,
admin tiene vía libre para tocar el pedido sin esta coreografía).

### Reglas de seguridad, en criollo

- `ticketEvents`: lectura pública (no sensible), configuración exclusiva de
  admin; `issuedCount` solo se mueve de a 1 con la aritmética validada.
- `orders`/`payments`: el staff crea y lee solo lo propio
  (`sellerUid`/`receivedByUid` == su uid); un admin ve y edita todo. Anular
  pedido/pago y confirmar transferencias es admin-only. Cualquiera del staff
  puede sumarle rifa a un pedido ya existente (incluso uno cargado antes de
  que la rifa existiera) o anotar los números del talonario entregados --
  si el total nuevo supera lo ya cobrado, el pedido vuelve a "partial" sin
  invalidar entradas ya emitidas.
- `tickets`: lectura amplia para cualquiera del staff (necesitan buscar por
  nombre/celular/código corto); lectura pública solo por `get` puntual con el
  código largo exacto (nunca `list`), así nadie enumera entradas ajenas. El
  check-in (`issued` → `checked_in`) es atómico contra el mismo snapshot
  "antes": si dos celulares escanean a la vez, el segundo pierde la carrera
  y su cliente muestra "ya ingresó". Autorizar un reingreso es la única
  escritura permitida sobre una entrada ya ingresada. Editar los datos del
  titular o borrar una entrada ya emitida es admin-only (el admin ya tiene
  vía libre para escribir cualquier campo; solo el borrado estaba
  hardcodeado en `false` y hubo que habilitarlo para admin). Borrar libera
  el cupo (`issuedCount - 1`) salvo que la entrada ya estuviera anulada, para
  no descontarlo dos veces.
- `auditLog`: create-only, inmutable incluso para un admin.

### Fases

- **Fase 1** (en curso): todo lo anterior.
- **Fase 2** (no arrancar sin confirmación): modo sin conexión para la
  puerta y recordatorios por WhatsApp.

## Resultado esperado de este prompt

Un sitio web publicado con Firebase que centralice la información de Flopi,
muestre todos los eventos en un calendario interactivo tipo Google Calendar,
permita a la comunidad proponer nuevos eventos (con aprobación previa),
recaude más donaciones, y sea mantenible por la familia a través de un panel
de administración simple, sin depender de un desarrollador para cada cambio
de contenido.
