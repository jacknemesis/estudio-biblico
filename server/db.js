import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "estudio.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/*
  usuarios: hoy vacía en la práctica (identidad = dispositivo_id anónimo).
  Queda creada para poder añadir login por email más adelante sin migrar
  la tabla de resaltados: bastará con rellenar resaltados.usuario_id.
*/
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id         TEXT PRIMARY KEY,
    email      TEXT UNIQUE,
    creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS resaltados (
    id            TEXT PRIMARY KEY,
    dispositivo_id TEXT NOT NULL,
    usuario_id    TEXT REFERENCES usuarios(id) ON DELETE SET NULL,
    texto         TEXT NOT NULL,
    contexto      TEXT NOT NULL,
    creado_en     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_resaltados_dispositivo
    ON resaltados (dispositivo_id, contexto);
  CREATE INDEX IF NOT EXISTS idx_resaltados_usuario
    ON resaltados (usuario_id);
`);

export const consultas = {
  listar: db.prepare(
    `SELECT id, dispositivo_id, texto, contexto, creado_en
       FROM resaltados
      WHERE dispositivo_id = ?
      ORDER BY creado_en ASC, rowid ASC`
  ),
  listarPorContexto: db.prepare(
    `SELECT id, dispositivo_id, texto, contexto, creado_en
       FROM resaltados
      WHERE dispositivo_id = ? AND contexto = ?
      ORDER BY creado_en ASC, rowid ASC`
  ),
  obtener: db.prepare(
    `SELECT id, dispositivo_id, texto, contexto, creado_en
       FROM resaltados WHERE id = ?`
  ),
  buscarIgual: db.prepare(
    `SELECT id, dispositivo_id, texto, contexto, creado_en
       FROM resaltados
      WHERE dispositivo_id = ? AND contexto = ? AND texto = ?`
  ),
  crear: db.prepare(
    `INSERT INTO resaltados (id, dispositivo_id, texto, contexto)
     VALUES (@id, @dispositivo_id, @texto, @contexto)`
  ),
  borrar: db.prepare(
    `DELETE FROM resaltados WHERE id = ? AND dispositivo_id = ?`
  ),
  borrarPorTexto: db.prepare(
    `DELETE FROM resaltados
      WHERE dispositivo_id = ? AND contexto = ? AND texto = ?`
  ),
};
