import crypto from "node:crypto";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import express from "express";
import {
  alcanceExportacion,
  facturasVisibles,
  historiasVisibles,
  puedeAdministrarUsuarios,
  puedeEscribirClinico,
  puedeLeerClinico,
  puedeReprogramarTurno,
  puedeVerFactura,
  puedeVerTurno,
  resultadosVisibles,
  turnosVisibles,
} from "./autorizacion.js";
import {
  ROLES,
  auditar,
  buscarPaciente,
  buscarUsuario,
  buscarUsuarioPorEmail,
  init,
  lab,
  restablecer,
  siguienteId,
  store,
  usuarioPublico,
  vistaFactura,
  vistaHistoria,
  vistaPaciente,
  vistaResultado,
  vistaTurno,
} from "./datos.js";

init();

const sesiones = new Map();
const CAMPOS_PERFIL = ["nombre"];
const CLAVES_INTERNAS = new Set(["id", "password", "passwordHash", "__proto__", "constructor", "prototype"]);

function idValido(valor) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero <= 0) return null;
  return numero;
}

function negar(res, mensaje) {
  return res.status(403).json({ error: mensaje, codigo: "ACCESO_DENEGADO" });
}

function exigirSesion(req, res, next) {
  const encabezado = req.headers.authorization || "";
  const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7) : "";
  const userId = token ? sesiones.get(token) : null;
  const usuario = userId ? buscarUsuario(userId) : null;
  if (!usuario) {
    return res.status(401).json({ error: "Tenés que iniciar sesión.", codigo: "NO_AUTENTICADO" });
  }
  if (!usuario.activo) {
    sesiones.delete(token);
    return res.status(401).json({ error: "La cuenta está inactiva.", codigo: "CUENTA_INACTIVA" });
  }
  req.usuario = usuario;
  req.token = token;
  next();
}

function registrarDecision(usuario, accion, recurso, permitido) {
  auditar({ usuario, accion, recurso, permitido, detalle: permitido ? "permitido" : "rechazado" });
}

export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.get("/api/salud", (_req, res) => {
  res.json({ ok: true, modo: lab.modo });
});

app.get("/api/lab/modo", (_req, res) => {
  res.json({
    modo: lab.modo,
    descripcion:
      lab.modo === "vulnerable"
        ? "La sesión alcanza para leer o modificar un recurso si se conoce su número."
        : "Cada recurso se autoriza en el servidor según rol y pertenencia.",
  });
});

app.post("/api/lab/modo", (req, res) => {
  const modo = req.body?.modo;
  if (modo !== "vulnerable" && modo !== "seguro") {
    return res.status(400).json({ error: "El modo debe ser vulnerable o seguro." });
  }
  lab.modo = modo;
  res.json({ modo: lab.modo });
});

app.post("/api/lab/restablecer", (_req, res) => {
  restablecer();
  res.json({ ok: true, modo: lab.modo });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const usuario = buscarUsuarioPorEmail(email);
  const claveOk = usuario ? bcrypt.compareSync(password, usuario.passwordHash) : false;
  if (!usuario || !claveOk) {
    auditar({
      usuario: null,
      accion: "login",
      recurso: "sesion",
      permitido: false,
      detalle: "credenciales inválidas",
    });
    return res.status(401).json({ error: "Credenciales inválidas." });
  }
  if (!usuario.activo) {
    auditar({ usuario, accion: "login", recurso: "sesion", permitido: false, detalle: "cuenta inactiva" });
    return res.status(401).json({ error: "La cuenta está inactiva.", codigo: "CUENTA_INACTIVA" });
  }
  const token = crypto.randomBytes(24).toString("hex");
  sesiones.set(token, usuario.id);
  auditar({ usuario, accion: "login", recurso: "sesion", permitido: true });
  res.json({ token, usuario: usuarioPublico(usuario) });
});

app.post("/api/auth/salir", exigirSesion, (req, res) => {
  sesiones.delete(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/yo", exigirSesion, (req, res) => {
  res.json({ usuario: usuarioPublico(req.usuario), modo: lab.modo });
});

app.put("/api/perfil", exigirSesion, (req, res) => {
  const cuerpo = req.body;
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return res.status(400).json({ error: "El cuerpo tiene que ser un objeto." });
  }
  const claves = Object.keys(cuerpo).filter((clave) => !CLAVES_INTERNAS.has(clave));
  if (claves.length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar." });
  }

  if (lab.modo === "seguro") {
    const rechazados = claves.filter((clave) => !CAMPOS_PERFIL.includes(clave));
    if (rechazados.length > 0) {
      registrarDecision(req.usuario, "actualizar-perfil", `usuario:${req.usuario.id}`, false);
      return res.status(400).json({
        error: "Hay campos que el perfil no puede modificar.",
        codigo: "CAMPOS_NO_PERMITIDOS",
        campos: rechazados,
      });
    }
  }

  const aplicados = [];
  if (claves.includes("nombre") || lab.modo === "vulnerable") {
    if (Object.prototype.hasOwnProperty.call(cuerpo, "nombre")) {
      const nombre = String(cuerpo.nombre || "").trim();
      if (nombre.length < 2 || nombre.length > 80) {
        return res.status(400).json({ error: "El nombre tiene que tener entre 2 y 80 caracteres." });
      }
      req.usuario.nombre = nombre;
      aplicados.push("nombre");
    }
  }

  if (lab.modo === "vulnerable") {
    for (const clave of claves) {
      if (clave === "nombre") continue;
      req.usuario[clave] = cuerpo[clave];
      aplicados.push(clave);
    }
  }

  registrarDecision(req.usuario, "actualizar-perfil", `usuario:${req.usuario.id}`, true);
  res.json({
    usuario: usuarioPublico(req.usuario),
    aplicados,
    aviso:
      lab.modo === "vulnerable" && aplicados.some((campo) => !CAMPOS_PERFIL.includes(campo))
        ? "Se guardaron campos que el cliente no debería controlar."
        : null,
  });
});

app.get("/api/historias", exigirSesion, (req, res) => {
  const historias = historiasVisibles(store, req.usuario).map(vistaHistoria);
  res.json({ historias });
});

app.get("/api/pacientes/:id/historia", exigirSesion, (req, res) => {
  const pacienteId = idValido(req.params.id);
  const paciente = pacienteId ? buscarPaciente(pacienteId) : null;
  if (!paciente) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeLeerClinico(req.usuario, pacienteId, lab.modo);
  registrarDecision(req.usuario, "leer-historia", `paciente:${pacienteId}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para ver esta historia clínica.");
  const historias = store.historias.filter((item) => item.pacienteId === pacienteId).map(vistaHistoria);
  res.json({
    paciente: vistaPaciente(paciente, { incluirDni: true }),
    historias,
  });
});

app.post("/api/pacientes/:id/historia", exigirSesion, (req, res) => {
  const pacienteId = idValido(req.params.id);
  const paciente = pacienteId ? buscarPaciente(pacienteId) : null;
  if (!paciente) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeEscribirClinico(req.usuario, pacienteId, lab.modo);
  registrarDecision(req.usuario, "escribir-historia", `paciente:${pacienteId}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para registrar un diagnóstico de este paciente.");
  const diagnostico = String(req.body?.diagnostico || "").trim();
  const notas = String(req.body?.notas || "").trim();
  if (diagnostico.length < 3 || diagnostico.length > 200) {
    return res.status(400).json({ error: "El diagnóstico tiene que tener entre 3 y 200 caracteres." });
  }
  if (notas.length > 2000) return res.status(400).json({ error: "Las notas superan el máximo permitido." });
  const historia = {
    id: siguienteId(store.historias),
    pacienteId,
    medicoId: req.usuario.id,
    fecha: new Date().toISOString().slice(0, 10),
    diagnostico,
    notas,
  };
  store.historias.push(historia);
  res.status(201).json({ historia: vistaHistoria(historia) });
});

app.get("/api/resultados", exigirSesion, (req, res) => {
  res.json({ resultados: resultadosVisibles(store, req.usuario).map(vistaResultado) });
});

app.get("/api/resultados/:id", exigirSesion, (req, res) => {
  const id = idValido(req.params.id);
  const resultado = id ? store.resultados.find((item) => item.id === id) : null;
  if (!resultado) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeLeerClinico(req.usuario, resultado.pacienteId, lab.modo);
  registrarDecision(req.usuario, "leer-resultado", `resultado:${id}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para ver este resultado.");
  res.json({
    resultado: vistaResultado(resultado),
    paciente: vistaPaciente(buscarPaciente(resultado.pacienteId), { incluirDni: true }),
  });
});

app.get("/api/turnos", exigirSesion, (req, res) => {
  res.json({ turnos: turnosVisibles(store, req.usuario).map(vistaTurno) });
});

app.get("/api/turnos/:id", exigirSesion, (req, res) => {
  const id = idValido(req.params.id);
  const turno = id ? store.turnos.find((item) => item.id === id) : null;
  if (!turno) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeVerTurno(req.usuario, turno, lab.modo);
  registrarDecision(req.usuario, "leer-turno", `turno:${id}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para ver este turno.");
  res.json({ turno: vistaTurno(turno) });
});

app.patch("/api/turnos/:id", exigirSesion, (req, res) => {
  const id = idValido(req.params.id);
  const turno = id ? store.turnos.find((item) => item.id === id) : null;
  if (!turno) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeReprogramarTurno(req.usuario, turno, lab.modo);
  registrarDecision(req.usuario, "reprogramar-turno", `turno:${id}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para reprogramar este turno.");
  const fecha = String(req.body?.fecha || "");
  const instante = new Date(fecha);
  if (!fecha || Number.isNaN(instante.getTime())) {
    return res.status(400).json({ error: "La fecha del turno no es válida." });
  }
  turno.fecha = fecha.length === 16 ? `${fecha}:00` : fecha;
  turno.estado = "reprogramado";
  res.json({ turno: vistaTurno(turno) });
});

app.get("/api/facturas", exigirSesion, (req, res) => {
  res.json({ facturas: facturasVisibles(store, req.usuario).map(vistaFactura) });
});

app.get("/api/facturas/:id", exigirSesion, (req, res) => {
  const id = idValido(req.params.id);
  const factura = id ? store.facturas.find((item) => item.id === id) : null;
  if (!factura) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeVerFactura(req.usuario, factura, lab.modo);
  registrarDecision(req.usuario, "leer-factura", `factura:${id}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para ver esta factura.");
  res.json({ factura: vistaFactura(factura) });
});

app.post("/api/facturas/:id/pagar", exigirSesion, (req, res) => {
  const id = idValido(req.params.id);
  const factura = id ? store.facturas.find((item) => item.id === id) : null;
  if (!factura) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeVerFactura(req.usuario, factura, lab.modo);
  registrarDecision(req.usuario, "pagar-factura", `factura:${id}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para registrar el pago de esta factura.");
  if (factura.estado === "pagada") {
    return res.status(400).json({ error: "La factura ya está pagada." });
  }
  factura.estado = "pagada";
  res.json({ factura: vistaFactura(factura) });
});

app.get("/api/reportes/export", exigirSesion, (req, res) => {
  const pacienteId = idValido(req.query.pacienteId);
  const paciente = pacienteId ? buscarPaciente(pacienteId) : null;
  if (!paciente) return res.status(400).json({ error: "Indicá un pacienteId válido." });
  const alcance = alcanceExportacion(req.usuario, pacienteId, lab.modo);
  registrarDecision(req.usuario, "exportar", `paciente:${pacienteId}`, Boolean(alcance));
  if (!alcance) return negar(res, "No tiene permiso para exportar los datos de este paciente.");

  const historias = store.historias.filter((item) => item.pacienteId === pacienteId).map(vistaHistoria);
  const resultados = store.resultados.filter((item) => item.pacienteId === pacienteId).map(vistaResultado);
  const facturas = store.facturas.filter((item) => item.pacienteId === pacienteId).map(vistaFactura);
  const base = {
    alcance,
    paciente: vistaPaciente(paciente, { incluirDni: alcance !== "facturacion" }),
  };
  if (alcance === "facturacion") return res.json({ ...base, facturas });
  if (alcance === "clinico") return res.json({ ...base, historias, resultados });
  return res.json({ ...base, historias, resultados, facturas });
});

app.get("/api/internal/debug/users", (req, res) => {
  if (lab.modo !== "vulnerable") {
    return res.status(404).json({ error: "No encontrado." });
  }
  auditar({
    usuario: null,
    accion: "debug",
    recurso: "usuarios",
    permitido: true,
    detalle: "endpoint de prueba expuesto",
  });
  res.json({
    aviso: "Endpoint de diagnóstico expuesto. No debería estar publicado.",
    usuarios: store.usuarios.map((usuario) => ({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      activo: usuario.activo,
    })),
  });
});

app.get("/api/admin/usuarios", exigirSesion, (req, res) => {
  const permitido = puedeAdministrarUsuarios(req.usuario, lab.modo);
  registrarDecision(req.usuario, "listar-usuarios", "admin/usuarios", permitido);
  if (!permitido) return negar(res, "No tiene permiso para administrar usuarios.");
  res.json({ usuarios: store.usuarios.map(usuarioPublico) });
});

app.get("/api/admin/auditoria", exigirSesion, (req, res) => {
  const permitido = puedeAdministrarUsuarios(req.usuario, lab.modo);
  registrarDecision(req.usuario, "leer-auditoria", "admin/auditoria", permitido);
  if (!permitido) return negar(res, "No tiene permiso para ver la auditoría.");
  res.json({ auditoria: store.auditoria.slice(0, 40) });
});

app.patch("/api/admin/usuarios/:id", exigirSesion, (req, res) => {
  const id = idValido(req.params.id);
  const objetivo = id ? buscarUsuario(id) : null;
  if (!objetivo) return res.status(404).json({ error: "No encontrado." });
  const permitido = puedeAdministrarUsuarios(req.usuario, lab.modo);
  registrarDecision(req.usuario, "cambiar-usuario", `usuario:${id}`, permitido);
  if (!permitido) return negar(res, "No tiene permiso para modificar usuarios.");
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "rol")) {
    if (!ROLES.includes(req.body.rol)) return res.status(400).json({ error: "El rol no es válido." });
    objetivo.rol = req.body.rol;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, "activo")) {
    if (typeof req.body.activo !== "boolean") {
      return res.status(400).json({ error: "El estado activo tiene que ser verdadero o falso." });
    }
    objetivo.activo = req.body.activo;
  }
  res.json({ usuario: usuarioPublico(objetivo) });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "No encontrado." });
});

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El JSON no se pudo leer." });
  }
  console.error(error);
  res.status(500).json({ error: "Error interno." });
});

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "..", "public")));

const esPrincipal = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (esPrincipal) {
  const puerto = Number(process.env.PORT) || 3000;
  app.listen(puerto, () => {
    console.log(`MediPortal en http://localhost:${puerto}`);
    console.log(`Modo inicial: ${lab.modo}`);
  });
}
