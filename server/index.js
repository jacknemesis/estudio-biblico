import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { consultas } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_PUBLICA = path.join(__dirname, "..", "public");

const PORT = process.env.PORT || 3000;
const MAX_TEXTO = 4000;
const MAX_CONTEXTO = 200;
const MAX_ID = 100;

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

/* ---------- helpers ---------- */

function limpiar(valor, max) {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  if (!v || v.length > max) return null;
  return v;
}

function error(res, codigo, mensaje) {
  return res.status(codigo).json({ error: mensaje });
}

/* ---------- API ---------- */

app.get("/api/salud", (_req, res) => {
  res.json({ ok: true });
});

// GET /api/resaltados?dispositivo_id=...&contexto=...
app.get("/api/resaltados", (req, res) => {
  const dispositivo_id = limpiar(req.query.dispositivo_id, MAX_ID);
  if (!dispositivo_id) return error(res, 400, "dispositivo_id requerido");

  const contexto = limpiar(req.query.contexto, MAX_CONTEXTO);
  const filas = contexto
    ? consultas.listarPorContexto.all(dispositivo_id, contexto)
    : consultas.listar.all(dispositivo_id);

  res.json({ resaltados: filas });
});

// POST /api/resaltados  { dispositivo_id, texto, contexto }
app.post("/api/resaltados", (req, res) => {
  const cuerpo = req.body || {};
  const dispositivo_id = limpiar(cuerpo.dispositivo_id, MAX_ID);
  const texto = limpiar(cuerpo.texto, MAX_TEXTO);
  const contexto = limpiar(cuerpo.contexto, MAX_CONTEXTO);

  if (!dispositivo_id) return error(res, 400, "dispositivo_id requerido");
  if (!texto) return error(res, 400, "texto requerido");
  if (!contexto) return error(res, 400, "contexto requerido");

  // Idempotente: el mismo texto en el mismo contexto no se duplica.
  const existente = consultas.buscarIgual.get(dispositivo_id, contexto, texto);
  if (existente) return res.status(200).json({ resaltado: existente });

  const fila = { id: crypto.randomUUID(), dispositivo_id, texto, contexto };
  consultas.crear.run(fila);
  res.status(201).json({ resaltado: consultas.obtener.get(fila.id) });
});

// DELETE /api/resaltados?dispositivo_id=...&contexto=...&texto=...
// (debe ir antes de la ruta con :id para no capturarla como id)
app.delete("/api/resaltados", (req, res) => {
  const dispositivo_id = limpiar(req.query.dispositivo_id, MAX_ID);
  const contexto = limpiar(req.query.contexto, MAX_CONTEXTO);
  const texto = limpiar(req.query.texto, MAX_TEXTO);

  if (!dispositivo_id) return error(res, 400, "dispositivo_id requerido");
  if (!contexto || !texto) return error(res, 400, "contexto y texto requeridos");

  const r = consultas.borrarPorTexto.run(dispositivo_id, contexto, texto);
  res.json({ borrados: r.changes });
});

// DELETE /api/resaltados/:id?dispositivo_id=...
app.delete("/api/resaltados/:id", (req, res) => {
  const dispositivo_id = limpiar(req.query.dispositivo_id, MAX_ID);
  const id = limpiar(req.params.id, MAX_ID);

  if (!dispositivo_id) return error(res, 400, "dispositivo_id requerido");
  if (!id) return error(res, 400, "id inválido");

  const r = consultas.borrar.run(id, dispositivo_id);
  if (!r.changes) return error(res, 404, "resaltado no encontrado");
  res.json({ borrados: r.changes });
});

/* ---------- estáticos ---------- */

app.use(express.static(RAIZ_PUBLICA, { extensions: ["html"] }));
app.get("/", (_req, res) => {
  res.sendFile(path.join(RAIZ_PUBLICA, "estudio-biblico.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  error(res, 500, "error interno");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Estudio bíblico escuchando en http://0.0.0.0:${PORT}`);
});
