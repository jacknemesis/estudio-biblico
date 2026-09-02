import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");

const DB_PATH = process.env.DB_PATH || path.join(RAIZ, "data", "estudio.db");
const MANIFIESTO = process.env.MANIFIESTO || path.join(RAIZ, "content", "materias.json");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/*
  Modelo
  ------
  materia   Una asignatura de la escuela (p. ej. "Vista panorámica del Antiguo
            Testamento"). Su contenido se sirve como un HTML de un solo archivo
            en public/materias/<id>.html, declarado en content/materias.json.
  estudio   Una unidad dentro de una materia (aquí, cada capítulo/clase). El
            contenido vive dentro del HTML de la materia; la base solo guarda
            su identificador para poder colgar datos de él.
  resaltado Se ancla a (materia, estudio, contexto). `contexto` es la vista
            concreta dentro del estudio, que ya distingue panel y listado.

  usuarios queda para añadir login por email más adelante: bastará con
  rellenar resaltados.usuario_id, sin migrar nada.
*/
db.exec(`
  CREATE TABLE IF NOT EXISTS materias (
    id        TEXT PRIMARY KEY,
    titulo    TEXT NOT NULL,
    resumen   TEXT,
    archivo   TEXT NOT NULL,
    orden     INTEGER NOT NULL DEFAULT 0,
    estado    TEXT NOT NULL DEFAULT 'publicada',
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS estudios (
    id         TEXT NOT NULL,
    materia_id TEXT NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    titulo     TEXT,
    grupo      TEXT,
    orden      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (materia_id, id)
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id        TEXT PRIMARY KEY,
    email     TEXT UNIQUE,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resaltados (
    id             TEXT PRIMARY KEY,
    dispositivo_id TEXT NOT NULL,
    usuario_id     TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
    materia_id     TEXT NOT NULL DEFAULT '',
    estudio_id     TEXT,
    texto          TEXT NOT NULL,
    contexto       TEXT NOT NULL,
    creado_en      TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/* Migración de bases anteriores al modelo de materias. */
const columnas = db.prepare(`PRAGMA table_info(resaltados)`).all().map(c => c.name);
if (!columnas.includes("materia_id")) {
  db.exec(`ALTER TABLE resaltados ADD COLUMN materia_id TEXT NOT NULL DEFAULT ''`);
}
if (!columnas.includes("estudio_id")) {
  db.exec(`ALTER TABLE resaltados ADD COLUMN estudio_id TEXT`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_resaltados_vista
    ON resaltados (dispositivo_id, materia_id, contexto);
  CREATE INDEX IF NOT EXISTS idx_resaltados_estudio
    ON resaltados (dispositivo_id, materia_id, estudio_id);
  CREATE INDEX IF NOT EXISTS idx_resaltados_usuario
    ON resaltados (usuario_id);
`);

/* ---------- catálogo desde el manifiesto ---------- */

const guardarMateria = db.prepare(
  `INSERT INTO materias (id, titulo, resumen, archivo, orden, estado)
   VALUES (@id, @titulo, @resumen, @archivo, @orden, @estado)
   ON CONFLICT(id) DO UPDATE SET
     titulo  = excluded.titulo,
     resumen = excluded.resumen,
     archivo = excluded.archivo,
     orden   = excluded.orden,
     estado  = excluded.estado`
);

/* El manifiesto manda: añadir una materia es dejar su HTML en
   public/materias/ y declararla en content/materias.json. */
export function cargarManifiesto() {
  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(MANIFIESTO, "utf8"));
  } catch (e) {
    console.warn(`No se pudo leer ${MANIFIESTO}: ${e.message}`);
    return { escuela: null, materias: [] };
  }
  const materias = Array.isArray(datos.materias) ? datos.materias : [];
  const sincronizar = db.transaction((lista) => {
    lista.forEach((m, i) => {
      if (!m || !m.id || !m.titulo || !m.archivo) {
        console.warn("Materia inválida en el manifiesto, se omite:", m && m.id);
        return;
      }
      guardarMateria.run({
        id: m.id,
        titulo: m.titulo,
        resumen: m.resumen || null,
        archivo: m.archivo,
        orden: Number.isFinite(m.orden) ? m.orden : i + 1,
        estado: m.estado || "publicada",
      });
    });
  });
  sincronizar(materias);
  return { escuela: datos.escuela || null, materias };
}

export const consultas = {
  materias: db.prepare(
    `SELECT id, titulo, resumen, archivo, orden, estado
       FROM materias
      WHERE estado = 'publicada'
      ORDER BY orden ASC, titulo ASC`
  ),
  materia: db.prepare(
    `SELECT id, titulo, resumen, archivo, orden, estado FROM materias WHERE id = ?`
  ),
  estudios: db.prepare(
    `SELECT id, materia_id, titulo, grupo, orden
       FROM estudios WHERE materia_id = ? ORDER BY orden ASC, id ASC`
  ),
  guardarEstudio: db.prepare(
    `INSERT INTO estudios (id, materia_id, titulo, grupo, orden)
     VALUES (@id, @materia_id, @titulo, @grupo, @orden)
     ON CONFLICT(materia_id, id) DO UPDATE SET
       titulo = excluded.titulo, grupo = excluded.grupo, orden = excluded.orden`
  ),

  listar: db.prepare(
    `SELECT id, dispositivo_id, materia_id, estudio_id, texto, contexto, creado_en
       FROM resaltados
      WHERE dispositivo_id = ? AND materia_id = ?
      ORDER BY creado_en ASC, rowid ASC`
  ),
  listarPorContexto: db.prepare(
    `SELECT id, dispositivo_id, materia_id, estudio_id, texto, contexto, creado_en
       FROM resaltados
      WHERE dispositivo_id = ? AND materia_id = ? AND contexto = ?
      ORDER BY creado_en ASC, rowid ASC`
  ),
  obtener: db.prepare(
    `SELECT id, dispositivo_id, materia_id, estudio_id, texto, contexto, creado_en
       FROM resaltados WHERE id = ?`
  ),
  buscarIgual: db.prepare(
    `SELECT id, dispositivo_id, materia_id, estudio_id, texto, contexto, creado_en
       FROM resaltados
      WHERE dispositivo_id = ? AND materia_id = ? AND contexto = ? AND texto = ?`
  ),
  crear: db.prepare(
    `INSERT INTO resaltados (id, dispositivo_id, materia_id, estudio_id, texto, contexto)
     VALUES (@id, @dispositivo_id, @materia_id, @estudio_id, @texto, @contexto)`
  ),
  borrar: db.prepare(
    `DELETE FROM resaltados WHERE id = ? AND dispositivo_id = ?`
  ),
  borrarPorTexto: db.prepare(
    `DELETE FROM resaltados
      WHERE dispositivo_id = ? AND materia_id = ? AND contexto = ? AND texto = ?`
  ),
};
