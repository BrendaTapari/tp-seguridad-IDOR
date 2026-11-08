import { app } from "../server/index.js";

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;

function verificar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

async function llamar(path, { method = "GET", token, body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token && auth) headers.Authorization = `Bearer ${token}`;
  const respuesta = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await respuesta.json().catch(() => ({}));
  return { status: respuesta.status, data, cache: respuesta.headers.get("cache-control") };
}

async function preparar(modo) {
  const reset = await llamar("/api/lab/restablecer", { method: "POST", body: {} });
  verificar(reset.status === 200, "no se pudieron restablecer los datos");
  const cambio = await llamar("/api/lab/modo", { method: "POST", body: { modo } });
  verificar(cambio.status === 200 && cambio.data.modo === modo, `no se pudo pasar a ${modo}`);
}

function texto(data) {
  return JSON.stringify(data);
}

try {
  const invalido = await llamar("/api/lab/modo", { method: "POST", body: { modo: "admin" } });
  verificar(invalido.status === 400, "un modo desconocido tiene que rechazarse");

  await preparar("vulnerable");
  const ana = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "ana.paz@mediportal.test", password: "portal" },
  });
  const lucas = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "lucas.diaz@mediportal.test", password: "portal" },
  });
  const molina = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "dra.molina@mediportal.test", password: "portal" },
  });
  const carlos = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "carlos.ruiz@mediportal.test", password: "portal" },
  });
  const nora = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "nora.vidal@mediportal.test", password: "portal" },
  });
  for (const sesion of [ana, lucas, molina, carlos, nora]) {
    verificar(sesion.status === 200 && sesion.data.token, "login de demostración falló");
  }
  const claveMala = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "ana.paz@mediportal.test", password: "otra" },
  });
  verificar(claveMala.status === 401, "una clave incorrecta tiene que fallar");

  const tokens = {
    ana: ana.data.token,
    lucas: lucas.data.token,
    molina: molina.data.token,
    carlos: carlos.data.token,
    nora: nora.data.token,
  };

  const sinSesion = await llamar("/api/pacientes/3/historia");
  verificar(sinSesion.status === 401, "sin sesión no se lee una historia");

  const lista = await llamar("/api/historias", { token: tokens.ana });
  verificar(lista.cache === "no-store", "la API no debe cachearse");
  verificar(lista.data.historias.every((item) => item.pacienteId === 1), "la lista de Ana incluye historias ajenas");

  const ajenaVulnerable = await llamar("/api/pacientes/3/historia", { token: tokens.ana });
  verificar(ajenaVulnerable.status === 200 && texto(ajenaVulnerable.data).includes("Embarazo"), "IDOR de historia en modo vulnerable");
  const resultadoAjeno = await llamar("/api/resultados/3", { token: tokens.ana });
  verificar(resultadoAjeno.status === 200 && resultadoAjeno.data.resultado.pacienteId === 3, "IDOR de resultado en modo vulnerable");
  const turnoAjeno = await llamar("/api/turnos/102", { token: tokens.ana });
  verificar(turnoAjeno.status === 200 && turnoAjeno.data.turno.pacienteId === 2, "IDOR de turno en modo vulnerable");
  const facturaAjena = await llamar("/api/facturas/202", { token: tokens.ana });
  verificar(facturaAjena.status === 200, "IDOR de factura en modo vulnerable");
  const exportAjena = await llamar("/api/reportes/export?pacienteId=3", { token: tokens.ana });
  verificar(exportAjena.status === 200 && exportAjena.data.alcance === "completo" && exportAjena.data.historias && exportAjena.data.facturas, "la exportación vulnerable no recorta el alcance");

  const debug = await llamar("/api/internal/debug/users", { auth: false });
  verificar(debug.status === 200 && debug.data.usuarios.length === 5, "el endpoint de prueba quedó expuesto");
  verificar(!texto(debug.data).includes("password"), "el debug no puede devolver secretos");

  const adminAna = await llamar("/api/admin/usuarios", { token: tokens.ana });
  verificar(adminAna.status === 200, "en modo vulnerable administración solo exige sesión");

  const escrito = await llamar("/api/pacientes/3/historia", {
    method: "POST",
    token: tokens.ana,
    body: { diagnostico: "Nota indebida", notas: "Escrita por un paciente." },
  });
  verificar(escrito.status === 201, "escritura IDOR en modo vulnerable");

  const pago = await llamar("/api/facturas/202/pagar", { method: "POST", token: tokens.ana, body: {} });
  verificar(pago.status === 200 && pago.data.factura.estado === "pagada", "pago IDOR en modo vulnerable");

  const escalada = await llamar("/api/perfil", {
    method: "PUT",
    token: tokens.ana,
    body: { nombre: "Ana Paz", rol: "sistemas", activo: true },
  });
  verificar(escalada.status === 200 && escalada.data.usuario.rol === "sistemas", "asignación masiva del rol");
  await llamar("/api/lab/modo", { method: "POST", body: { modo: "seguro" } });
  const adminTrasEscalada = await llamar("/api/admin/usuarios", { token: tokens.ana });
  verificar(adminTrasEscalada.status === 200, "el rol ya escrito sigue valiendo en modo seguro");

  await preparar("vulnerable");
  const cambiarPaciente = await llamar("/api/perfil", {
    method: "PUT",
    token: tokens.ana,
    body: { pacienteId: 2 },
  });
  verificar(cambiarPaciente.status === 200 && cambiarPaciente.data.usuario.pacienteId === 2, "asignación masiva de pacienteId");
  await llamar("/api/lab/modo", { method: "POST", body: { modo: "seguro" } });
  const listaTrasCambio = await llamar("/api/historias", { token: tokens.ana });
  verificar(texto(listaTrasCambio.data).includes("Lumbalgia"), "cambiar pacienteId esquiva el filtro de la lista");

  await preparar("seguro");
  const historiaAjena = await llamar("/api/pacientes/3/historia", { token: tokens.ana });
  verificar(historiaAjena.status === 403 && !texto(historiaAjena.data).includes("Embarazo"), "modo seguro bloquea la historia ajena");
  const historiaPropia = await llamar("/api/pacientes/1/historia", { token: tokens.ana });
  verificar(historiaPropia.status === 200 && historiaPropia.data.paciente.nombre === "Ana Paz", "Ana sigue viendo su historia");
  verificar((await llamar("/api/resultados/3", { token: tokens.ana })).status === 403, "modo seguro bloquea el resultado ajeno");
  verificar((await llamar("/api/turnos/102", { token: tokens.ana })).status === 403, "modo seguro bloquea el turno ajeno");
  const reprogramarAjeno = await llamar("/api/turnos/102", {
    method: "PATCH",
    token: tokens.ana,
    body: { fecha: "2026-12-01T08:00" },
  });
  verificar(reprogramarAjeno.status === 403, "modo seguro bloquea reprogramar un turno ajeno");
  const reprogramarPropio = await llamar("/api/turnos/101", {
    method: "PATCH",
    token: tokens.ana,
    body: { fecha: "2026-12-02T09:00" },
  });
  verificar(reprogramarPropio.status === 200 && reprogramarPropio.data.turno.estado === "reprogramado", "Ana reprograma su turno");
  verificar((await llamar("/api/facturas/202", { token: tokens.ana })).status === 403, "modo seguro bloquea la factura ajena");
  const pagoPropio = await llamar("/api/facturas/201/pagar", { method: "POST", token: tokens.ana, body: {} });
  verificar(pagoPropio.status === 200, "Ana paga su factura");
  const exportAjenaSegura = await llamar("/api/reportes/export?pacienteId=3", { token: tokens.ana });
  verificar(exportAjenaSegura.status === 403, "Ana no exporta a otra paciente");
  const exportPropia = await llamar("/api/reportes/export?pacienteId=1", { token: tokens.ana });
  verificar(exportPropia.status === 200 && exportPropia.data.alcance === "propio", "Ana exporta lo propio");

  verificar((await llamar("/api/pacientes/2/historia", { token: tokens.molina })).status === 403, "la médica no lee pacientes fuera de su asignación");
  const maria = await llamar("/api/pacientes/3/historia", { token: tokens.molina });
  verificar(maria.status === 200, "la médica lee a sus pacientes");
  verificar((await llamar("/api/facturas/201", { token: tokens.molina })).status === 403, "la médica no ve facturas");
  verificar((await llamar("/api/turnos/102", { token: tokens.molina })).status === 403, "la médica no ve turnos de otro profesional");
  const exportClinica = await llamar("/api/reportes/export?pacienteId=3", { token: tokens.molina });
  verificar(exportClinica.status === 200 && exportClinica.data.historias && exportClinica.data.facturas === undefined, "la exportación médica no incluye facturas");
  const diagnostico = await llamar("/api/pacientes/1/historia", {
    method: "POST",
    token: tokens.molina,
    body: { diagnostico: "Control registrado", notas: "PA estable." },
  });
  verificar(diagnostico.status === 201, "la médica registra un diagnóstico de su paciente");
  const diagnosticoAjeno = await llamar("/api/pacientes/2/historia", {
    method: "POST",
    token: tokens.molina,
    body: { diagnostico: "No corresponde", notas: "" },
  });
  verificar(diagnosticoAjeno.status === 403, "la médica no escribe fuera de su asignación");

  verificar((await llamar("/api/pacientes/3/historia", { token: tokens.carlos })).status === 403, "administración no lee historia clínica");
  verificar((await llamar("/api/facturas/202", { token: tokens.carlos })).status === 200, "administración ve la factura");
  verificar((await llamar("/api/turnos/102", { token: tokens.carlos })).status === 200, "administración ve la agenda");
  const exportFactura = await llamar("/api/reportes/export?pacienteId=3", { token: tokens.carlos });
  verificar(exportFactura.status === 200 && exportFactura.data.alcance === "facturacion" && exportFactura.data.historias === undefined, "administración exporta solo facturación");
  verificar((await llamar("/api/admin/usuarios", { token: tokens.carlos })).status === 403, "administración no administra usuarios");

  verificar((await llamar("/api/pacientes/1/historia", { token: tokens.nora })).status === 403, "sistemas no lee historia clínica");
  verificar((await llamar("/api/facturas/201", { token: tokens.nora })).status === 403, "sistemas no ve facturas");
  verificar((await llamar("/api/admin/usuarios", { token: tokens.nora })).status === 200, "sistemas administra usuarios");
  verificar((await llamar("/api/admin/usuarios", { token: tokens.ana })).status === 403, "un paciente no administra usuarios en modo seguro");
  const perfil = await llamar("/api/perfil", {
    method: "PUT",
    token: tokens.ana,
    body: { nombre: "Ana Paz", rol: "sistemas", activo: false },
  });
  verificar(perfil.status === 400 && perfil.data.codigo === "CAMPOS_NO_PERMITIDOS", "la lista de campos rechaza rol y activo");
  const yo = await llamar("/api/auth/yo", { token: tokens.ana });
  verificar(yo.data.usuario.rol === "paciente" && yo.data.usuario.activo === true, "el rechazo no aplica los campos prohibidos");
  const soloNombre = await llamar("/api/perfil", { method: "PUT", token: tokens.ana, body: { nombre: "Ana Paula Paz" } });
  verificar(soloNombre.status === 200 && soloNombre.data.usuario.rol === "paciente", "el nombre sigue siendo editable");

  const debugSeguro = await llamar("/api/internal/debug/users", { auth: false });
  verificar(debugSeguro.status === 404, "el endpoint de prueba no existe en modo seguro");

  await preparar("vulnerable");
  const baja = await llamar("/api/admin/usuarios/2", {
    method: "PATCH",
    token: tokens.ana,
    body: { activo: false },
  });
  verificar(baja.status === 200 && baja.data.usuario.activo === false, "un paciente desactiva otra cuenta si la función no controla el rol");
  const lucasInactivo = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "lucas.diaz@mediportal.test", password: "portal" },
  });
  verificar(lucasInactivo.status === 401, "la cuenta desactivada no ingresa");

  await preparar("seguro");
  const lucasOtraVez = await llamar("/api/auth/login", {
    method: "POST",
    body: { email: "lucas.diaz@mediportal.test", password: "portal" },
  });
  verificar(lucasOtraVez.status === 200 && lucasOtraVez.data.usuario.rol === "paciente", "restablecer vuelve al estado inicial");
  const desconocido = await llamar("/api/pacientes/99/historia", { token: tokens.ana });
  verificar(desconocido.status === 404, "un paciente inexistente responde 404");

  console.log("Verificación completa: controles vulnerables y seguros responden como corresponde.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  server.close();
}
