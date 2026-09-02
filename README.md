# Estudio bíblico · Berea

Materias de estudio bíblico de Berea, con backend liviano para que los
resaltados persistan en servidor y se sincronicen entre dispositivos.

La primera materia es **Vista panorámica del Antiguo Testamento**; el modelo
está pensado para ir añadiendo más.

## Modelo

    escuela   Berea
      materia   una asignatura ("Vista panorámica del Antiguo Testamento")
        estudio   una unidad dentro de la materia (aquí, cada capítulo/clase)
          contexto  la vista concreta dentro del estudio (panel, listado)

Cada **materia** es un HTML de un solo archivo, autocontenido, en
`public/materias/<id>.html`, declarado en `content/materias.json`. Los
**estudios** viven dentro de ese HTML (aquí, los 84 capítulos agrupados por
libro); la base de datos solo guarda su identificador, para poder colgar datos
de ellos sin tener que trocear el contenido.

Los resaltados se anclan a `(materia_id, estudio_id, contexto)`, así que dos
materias pueden usar el mismo `contexto` sin pisarse.

## Añadir una materia

1. Dejá su HTML en `public/materias/<id>.html`.
2. Agregá la entrada en `content/materias.json`:

       { "id": "<id>", "titulo": "...", "resumen": "...",
         "archivo": "materias/<id>.html", "orden": 2, "estado": "publicada" }

3. Reiniciá. El manifiesto se sincroniza con la tabla `materias` al arrancar.

`"estado"` distinto de `"publicada"` la oculta del portal y de la API: sirve
para dejar una materia en preparación dentro del repo.

Para que el HTML nuevo tenga resaltados sincronizados solo necesita el mismo
bloque `Resaltados`: la materia se deduce de su propia ruta, no está escrita
a mano.

## Estructura

    server/index.js       Express: catálogo, API de resaltados, estáticos
    server/db.js          SQLite (better-sqlite3), esquema y consultas
    content/materias.json manifiesto del catálogo
    public/index.html     portal con la lista de materias
    public/materias/      un HTML autocontenido por materia
    Dockerfile            node:20-alpine

## Persistencia

La base SQLite vive en `DB_PATH` (`/app/data/estudio.db` en el contenedor).
**Ese directorio tiene que ser un volumen persistente**: sin él, el contenedor
se recrea desde cero en cada redeploy y los resaltados se pierden.

- `docker-compose.yml` ya lo declara: volumen `estudio-datos` montado en
  `/app/data`. Es la forma más segura de desplegar.
- El `Dockerfile` declara `VOLUME ["/app/data"]`. Eso protege los reinicios del
  contenedor, pero en un redeploy Docker crea un volumen anónimo nuevo: no
  basta por sí solo, hay que montar un volumen con nombre.
- En un PaaS sin compose, hay que añadir el volumen a mano en el panel
  (almacenamiento persistente → montar en `/app/data`).

Cómo comprobar que funciona: el arranque registra la línea

    Base de datos: /app/data/estudio.db (existente|nueva)

Si tras cada redeploy dice `nueva`, el volumen **no** está montado.

## Local

    npm install
    npm start          # http://localhost:3000

Variables: `PORT` (3000), `DB_PATH` (`./data/estudio.db`),
`MANIFIESTO` (`./content/materias.json`).

## API

Identidad = `dispositivo_id`, un uuid anónimo generado en el cliente y guardado
en `localStorage` (`estudio-biblico:dispositivo`). Sin login.

    GET    /api/materias
    GET    /api/materias/:id
    GET    /api/materias/:id/estudios
    GET    /api/resaltados?dispositivo_id=...&materia_id=...[&contexto=...]
    POST   /api/resaltados   { dispositivo_id, materia_id, texto, contexto, estudio_id? }
    DELETE /api/resaltados/:id?dispositivo_id=...
    DELETE /api/resaltados?dispositivo_id=...&materia_id=...&contexto=...&texto=...
    GET    /api/salud

`POST` es idempotente: el mismo texto en el mismo contexto no se duplica y
devuelve 200 con el resaltado existente. Un `materia_id` que no esté en el
catálogo devuelve 404.

## Sincronización en el cliente

El bloque `Resaltados` del HTML mantiene `localStorage` como caché y fallback,
con una clave por materia:

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
`NULL`). Añadir login por email es rellenar `usuario_id` y filtrar por él, sin
migrar el esquema ni perder los resaltados anónimos existentes.
