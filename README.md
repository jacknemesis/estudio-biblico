# Estudio bíblico

Estudio bíblico interactivo (84 capítulos, navegación por burbujas, mapas SVG)
con backend liviano para que los resaltados persistan en servidor y se
sincronicen entre dispositivos.

## Estructura

    server/index.js   Express: API REST + estáticos
    server/db.js      SQLite (better-sqlite3), esquema y consultas
    public/           estudio-biblico.html (la app, un solo archivo)
    Dockerfile        node:20-alpine

## Local

    npm install
    npm start          # http://localhost:3000

Variables: `PORT` (3000), `DB_PATH` (`./data/estudio.db`).

## API

Identidad = `dispositivo_id`, un uuid anónimo generado en el cliente y guardado
en `localStorage` (`estudio-biblico:dispositivo`). Sin login.

    GET    /api/resaltados?dispositivo_id=...[&contexto=...]
    POST   /api/resaltados          { dispositivo_id, texto, contexto }
    DELETE /api/resaltados/:id?dispositivo_id=...
    DELETE /api/resaltados?dispositivo_id=...&contexto=...&texto=...
    GET    /api/salud

`contexto` es la vista: `"Gn 4|0"` (sigla|panel), `"libro:Génesis"` o
`"cronologia"`. `POST` es idempotente: el mismo texto en el mismo contexto no
se duplica y devuelve 200 con el resaltado existente.

## Sincronización en el cliente

El bloque `Resaltados` del HTML mantiene `localStorage` como caché y fallback:

- pinta al instante desde la caché y en paralelo hace `GET` del contexto actual;
- si el servidor responde, manda él: se reconcilia la caché y se repintan las marcas;
- si no responde, la app sigue funcionando solo con la caché;
- los resaltados creados sin conexión quedan con `id: null` y se suben en la
  siguiente sincronización correcta.

El texto se compara normalizado (minúsculas, espacios colapsados): la selección
del navegador devuelve el texto ya renderizado, que puede no coincidir con el
DOM cuando hay `text-transform: uppercase` o saltos de línea y sangrías.

## Login más adelante

La tabla `usuarios` y la columna `resaltados.usuario_id` ya existen (hoy en
`NULL`). Añadir login por email es rellenar `usuario_id` y filtrar por él,
sin migrar el esquema ni perder los resaltados anónimos existentes.
