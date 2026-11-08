const ROLES = [
  ["paciente", "Paciente"],
  ["medico", "Médica / médico"],
  ["administrativo", "Administración"],
  ["sistemas", "Sistemas"],
];

const ENLACES = [
  ["#/inicio", "Inicio", ["paciente", "medico", "administrativo", "sistemas"]],
  ["#/historias", "Historias clínicas", ["paciente", "medico"]],
  ["#/resultados", "Resultados", ["paciente", "medico"]],
  ["#/turnos", "Turnos", ["paciente", "medico", "administrativo"]],
  ["#/facturas", "Facturación", ["paciente", "administrativo"]],
  ["#/reportes", "Reportes", ["paciente", "medico", "administrativo"]],
  ["#/perfil", "Mi perfil", ["paciente", "medico", "administrativo", "sistemas"]],
  ["#/admin", "Administración", ["sistemas"]],
  ["#/guia", "Guía del práctico", ["paciente", "medico", "administrativo", "sistemas"]],
];

const TAREAS = {
  paciente: "Consultás tus turnos, resultados, historia clínica y facturas.",
  medico: "Registrás diagnósticos de tus pacientes y ves los turnos de tu agenda.",
  administrativo: "Gestionás la agenda y la facturación. La historia clínica no corresponde a este rol.",
  sistemas: "Administrás usuarios y roles. Los datos clínicos y las facturas no corresponden a este rol.",
};

const state = {
  token: sessionStorage.getItem("mp_token"),
  user: leerJson(sessionStorage.getItem("mp_user")),
  rolUi: localStorage.getItem("mediportal_rol"),
  modo: "vulnerable",
  aviso: null,
  guia: {},
  perfilResultado: "",
  route: { name: "inicio", id: null },
};

if (state.user && !state.rolUi) {
  state.rolUi = state.user.rol;
  localStorage.setItem("mediportal_rol", state.rolUi);
}

function leerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[caracter]));
}

function pesos(valor) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(valor);
}

function fechaCorta(iso) {
  const base = String(iso || "").slice(0, 10);
  const [anio, mes, dia] = base.split("-");
  if (!anio || !mes || !dia) return esc(iso);
  return `${dia}/${mes}/${anio}`;
}

function fechaTurno(iso) {
  const hora = String(iso || "").slice(11, 16);
  return hora ? `${fechaCorta(iso)} ${hora}` : fechaCorta(iso);
}

function etiquetaRol(rol) {
  return ROLES.find((item) => item[0] === rol)?.[1] || rol || "sin rol";
}

function setSession(data) {
  state.token = data.token;
  state.user = data.usuario;
  state.rolUi = data.usuario.rol;
  sessionStorage.setItem("mp_token", data.token);
  sessionStorage.setItem("mp_user", JSON.stringify(data.usuario));
  localStorage.setItem("mediportal_rol", data.usuario.rol);
}

function guardarUsuario(usuario) {
  state.user = usuario;
  sessionStorage.setItem("mp_user", JSON.stringify(usuario));
}

function clearSession() {
  state.token = null;
  state.user = null;
  state.rolUi = null;
  sessionStorage.removeItem("mp_token");
  sessionStorage.removeItem("mp_user");
  localStorage.removeItem("mediportal_rol");
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (state.token && opts.auth !== false) headers.Authorization = `Bearer ${state.token}`;
  let respuesta;
  try {
    respuesta = await fetch(path, {
      method: opts.method || "GET",
      headers,
      cache: "no-store",
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { error: "No se pudo contactar al servidor." } };
  }
  const data = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 && state.token && opts.auth !== false) {
    clearSession();
    if ((location.hash || "") !== "#/login") location.hash = "#/login";
  }
  return { ok: respuesta.ok, status: respuesta.status, data };
}

function parseRoute() {
  const partes = (location.hash || "#/inicio").replace(/^#\//, "").split("/");
  const id = partes[1] ? Number(partes[1]) : null;
  return { name: partes[0] || "inicio", id: Number.isInteger(id) ? id : null };
}

function logo(claro) {
  const fondo = claro ? "#f6f3ee" : "#1b3a4b";
  const cruz = claro ? "#1b3a4b" : "#f6f3ee";
  return `
    <div class="marca">
      <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="${fondo}"></rect>
        <path d="M14 8h4v6h6v4h-6v6h-4v-6H8v-4h6z" fill="${cruz}"></path>
      </svg>
      <div>
        <strong>MediPortal</strong>
        <span>Red de Clínicas del Sur</span>
      </div>
    </div>`;
}

function controlModo() {
  const vulnerable = state.modo === "vulnerable";
  return `
    <div class="modo" role="group" aria-label="Modo del laboratorio">
      <button type="button" data-accion="modo" data-modo="vulnerable" class="${vulnerable ? "activo" : ""}">Vulnerable</button>
      <button type="button" data-accion="modo" data-modo="seguro" class="${vulnerable ? "" : "activo"}">Seguro</button>
      <button type="button" class="btn-texto" data-accion="restablecer">Restablecer datos</button>
    </div>`;
}

function bandaModo() {
  if (state.modo === "seguro") {
    return `<div class="banda banda-seguro">Modo seguro: el servidor autoriza cada recurso según el rol y la pertenencia. Ocultar un menú no reemplaza ese control.</div>`;
  }
  return `<div class="banda banda-vulnerable">Modo vulnerable: una sesión válida alcanza para leer o modificar un recurso si se conoce su número. El rol no se controla en las funciones administrativas.</div>`;
}

function bandaDesfase() {
  if (!state.user || state.rolUi === state.user.rol) return "";
  return `
    <div class="banda banda-desfase">
      El menú usa el rol guardado en el navegador (${esc(etiquetaRol(state.rolUi))}).
      El servidor reconoce ${esc(etiquetaRol(state.user.rol))}.
      <button type="button" class="btn-texto" data-accion="sincronizar-rol">Usar el rol del servidor en el menú</button>
    </div>`;
}

function shell(contenido) {
  const route = state.route;
  const enlaces = ENLACES.filter((item) => item[2].includes(state.rolUi))
    .map(([href, texto]) => {
      const nombre = href.slice(2);
      const actual = route.name === nombre ? ' aria-current="page"' : "";
      return `<a href="${href}"${actual}>${texto}</a>`;
    })
    .join("");
  const opciones = ROLES.map(([valor, texto]) => {
    const selected = valor === state.rolUi ? " selected" : "";
    return `<option value="${valor}"${selected}>${texto}</option>`;
  }).join("");
  return `
    <div class="app">
      <aside class="sidebar">
        ${logo(true)}
        <nav class="nav">${enlaces}</nav>
        <label class="rol-local">
          Rol guardado en el navegador
          <select data-rol-ui>${opciones}</select>
          <small>Esto solo cambia el menú. El servidor sigue usando el rol de la sesión: ${esc(etiquetaRol(state.user.rol))}.</small>
        </label>
      </aside>
      <div class="contenido">
        <header class="topbar">
          ${controlModo()}
          <div class="quien">
            <strong>${esc(state.user.nombre)}</strong>
            <span>${esc(state.user.email)}</span>
            <button type="button" class="btn-texto" data-accion="salir">Cerrar sesión</button>
          </div>
        </header>
        ${bandaModo()}
        ${bandaDesfase()}
        <main>
          ${state.aviso ? `<p class="aviso aviso-${esc(state.aviso.tipo)}">${esc(state.aviso.texto)}</p>` : ""}
          ${contenido}
          <p class="pie">Datos ficticios. Laboratorio local para el trabajo práctico de control de acceso.</p>
        </main>
      </div>
    </div>`;
}

function solicitud(metodo, path, status) {
  const clase = status >= 200 && status < 300 ? "ok" : "mal";
  const http = status ? `<b class="http ${clase}">${status}</b>` : "";
  return `<p class="solicitud"><span>${esc(metodo)}</span> <code>${esc(path)}</code> ${http}</p>`;
}

function bloqueApi(metodo, path, status, data) {
  return `${solicitud(metodo, path, status)}<pre>${esc(JSON.stringify(data, null, 2))}</pre>`;
}

function bloqueado(metodo, path, status, data) {
  return `
    <section class="card card-bloqueo">
      ${solicitud(metodo, path, status)}
      <h2>El servidor rechazó el acceso</h2>
      <p>${esc(data.error || "Sin permiso")}</p>
      <p class="nota">La pantalla del navegador se abrió igual. La autorización tiene que decidirla el servidor, no la ruta ni el menú.</p>
    </section>`;
}

function buscarId(titulo, base, ejemplo) {
  return `
    <form class="card buscar" data-form="ir" data-base="${base}">
      <h2>${titulo}</h2>
      <div class="fila">
        <input name="id" inputmode="numeric" placeholder="Número" required>
        <button class="btn" type="submit">Abrir</button>
      </div>
      <p class="nota">${ejemplo}</p>
    </form>`;
}

function vistaLogin() {
  return `
    <div class="login">
      <section class="login-marca">
        <div>
          ${logo(true)}
          <h1>Cada persona ve solo lo que le corresponde.</h1>
          <p>MediPortal reemplaza historias en papel y resultados enviados por correo. Este laboratorio muestra qué pasa cuando esa promesa se controla en la pantalla y no en el servidor, y cómo se corrige.</p>
        </div>
        <p>Trabajo práctico · Broken Access Control</p>
      </section>
      <section class="login-panel">
        ${controlModo()}
        <h2>Ingresar</h2>
        <form data-form="login">
          <label class="campo">Correo
            <input name="email" type="email" autocomplete="username" required>
          </label>
          <label class="campo">Clave
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <button class="btn" type="submit">Entrar</button>
          <p id="login-error" class="error" hidden></p>
        </form>
      </section>
    </div>`;
}

async function vistaInicio() {
  const [historias, resultados, turnos, facturas] = await Promise.all([
    api("/api/historias"),
    api("/api/resultados"),
    api("/api/turnos"),
    api("/api/facturas"),
  ]);
  const tarjetas = [];
  const historia = historias.data.historias?.[0];
  const resultado = resultados.data.resultados?.[0];
  const turno = turnos.data.turnos?.[0];
  const factura = (facturas.data.facturas || []).find((item) => item.estado === "pendiente") || facturas.data.facturas?.[0];
  if (historia) {
    tarjetas.push(tarjeta(`#/historias/${historia.pacienteId}`, "Historia clínica", historia.pacienteNombre, historia.diagnostico));
  }
  if (resultado) {
    tarjetas.push(tarjeta(`#/resultados/${resultado.id}`, "Resultado", resultado.tipo, resultado.resumen));
  }
  if (turno) {
    tarjetas.push(tarjeta(`#/turnos/${turno.id}`, "Próximo turno", fechaTurno(turno.fecha), `${turno.pacienteNombre} · ${turno.motivo}`));
  }
  if (factura) {
    tarjetas.push(tarjeta(`#/facturas/${factura.id}`, "Factura", pesos(factura.monto), `${factura.concepto} · ${factura.estado}`));
  }
  const vacio = tarjetas.length ? `<div class="grilla">${tarjetas.join("")}</div>` : `<p class="nota">No hay recursos de tu rol en el inicio. Las funciones administrativas están en su propia pantalla.</p>`;
  return `
    <h1>Hola, ${esc(state.user.nombre.split(" ")[0])}</h1>
    <p class="lead">${esc(TAREAS[state.user.rol] || "")}</p>
    ${vacio}
    <p class="nota">Los números que ves en cada enlace viajan en la URL. Cambiarlos es la prueba de acceso directo a un objeto. El resultado correcto depende del modo del laboratorio.</p>`;
}

function tarjeta(href, kicker, titulo, detalle) {
  return `
    <a class="card enlace-card" href="${href}">
      <span>${esc(kicker)}</span>
      <h2>${esc(titulo)}</h2>
      <p>${esc(detalle)}</p>
    </a>`;
}

async function vistaHistorias() {
  const res = await api("/api/historias");
  const items = (res.data.historias || []).map((item) => `
    <a class="card enlace-card" href="#/historias/${item.pacienteId}">
      <span>Paciente ${item.pacienteId} · ${fechaCorta(item.fecha)}</span>
      <h2>${esc(item.diagnostico)}</h2>
      <p>${esc(item.pacienteNombre)} · ${esc(item.medicoNombre)}</p>
    </a>`).join("");
  return `
    <h1>Historias clínicas</h1>
    <p class="lead">La lista sale filtrada por el rol. El fallo aparece al pedir un paciente por su número.</p>
    <div class="grilla">${items || `<p class="nota">No hay historias dentro de tu alcance.</p>`}</div>
    ${buscarId("Abrir por número de paciente", "#/historias/", "Ana es la paciente 1, Lucas el 2 y María Soto la 3. María no tiene usuario del portal: igual tiene historia clínica.")}`;
}

async function vistaHistoria(id) {
  const path = `/api/pacientes/${id}/historia`;
  const res = await api(path);
  if (!res.ok) return bloqueado("GET", path, res.status, res.data);
  const lineas = res.data.historias.map((item) => `
    <article class="card">
      <span>${fechaCorta(item.fecha)} · ${esc(item.medicoNombre)}</span>
      <h2>${esc(item.diagnostico)}</h2>
      <p>${esc(item.notas)}</p>
    </article>`).join("");
  const formulario = state.user.rol === "medico" || state.modo === "vulnerable" ? `
    <form class="card" data-form="diagnostico" data-paciente="${id}">
      <h2>Registrar diagnóstico</h2>
      <label class="campo">Diagnóstico <input name="diagnostico" required maxlength="200"></label>
      <label class="campo">Notas <textarea name="notas" maxlength="2000"></textarea></label>
      <button class="btn" type="submit">Guardar en la historia ${id}</button>
      <p class="nota">En el modo vulnerable el formulario se muestra aunque el rol no sea médico: ocultarlo no es el control.</p>
    </form>` : "";
  const paciente = res.data.paciente;
  return `
    ${solicitud("GET", path, res.status)}
    <h1>${esc(paciente.nombre)}</h1>
    <p class="lead">Paciente Nº ${paciente.id} · DNI ${esc(paciente.dni)} · ${esc(paciente.obraSocial)}</p>
    <div class="escenarios">${lineas || `<p class="nota">Este paciente no tiene evoluciones.</p>`}</div>
    ${formulario}`;
}

async function vistaResultados() {
  const res = await api("/api/resultados");
  const items = (res.data.resultados || []).map((item) => `
    <a class="card enlace-card" href="#/resultados/${item.id}">
      <span>Archivo ${item.id} · ${fechaCorta(item.fecha)}</span>
      <h2>${esc(item.tipo)}</h2>
      <p>${esc(item.pacienteNombre)}</p>
    </a>`).join("");
  return `
    <h1>Resultados</h1>
    <p class="lead">Cada estudio tiene un número de archivo. Ese número es el identificador directo.</p>
    <div class="grilla">${items || `<p class="nota">No hay resultados dentro de tu alcance.</p>`}</div>
    ${buscarId("Abrir por número de archivo", "#/resultados/", "El hemograma de Ana es el archivo 1, la resonancia de Lucas el 2 y la ecografía de María el 3.")}`;
}

async function vistaResultado(id) {
  const path = `/api/resultados/${id}`;
  const res = await api(path);
  if (!res.ok) return bloqueado("GET", path, res.status, res.data);
  const item = res.data.resultado;
  return `
    ${solicitud("GET", path, res.status)}
    <h1>${esc(item.tipo)}</h1>
    <p class="lead">${esc(item.pacienteNombre)} · paciente ${item.pacienteId} · ${fechaCorta(item.fecha)}</p>
    <article class="card"><p>${esc(item.resumen)}</p><p class="meta">DNI ${esc(res.data.paciente.dni)}</p></article>`;
}

async function vistaTurnos() {
  const res = await api("/api/turnos");
  const filas = (res.data.turnos || []).map((item) => `
    <tr>
      <td><a href="#/turnos/${item.id}">${item.id}</a></td>
      <td>${fechaTurno(item.fecha)}</td>
      <td>${esc(item.pacienteNombre)}</td>
      <td>${esc(item.medicoNombre)}</td>
      <td>${esc(item.motivo)}</td>
      <td>${esc(item.estado)}</td>
    </tr>`).join("");
  return `
    <h1>Turnos</h1>
    <p class="lead">La reprogramación usa el número de turno. En el modo vulnerable no importa de quién sea.</p>
    <div class="card tabla-wrap">
      <table>
        <thead><tr><th>Nº</th><th>Cuándo</th><th>Paciente</th><th>Profesional</th><th>Motivo</th><th>Estado</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="6">No hay turnos dentro de tu alcance.</td></tr>`}</tbody>
      </table>
    </div>
    ${buscarId("Abrir por número de turno", "#/turnos/", "101 es de Ana, 102 de Lucas y 103 de María.")}`;
}

async function vistaTurno(id) {
  const path = `/api/turnos/${id}`;
  const res = await api(path);
  if (!res.ok) return bloqueado("GET", path, res.status, res.data);
  const item = res.data.turno;
  return `
    ${solicitud("GET", path, res.status)}
    <h1>Turno ${item.id}</h1>
    <p class="lead">${esc(item.pacienteNombre)} con ${esc(item.medicoNombre)}</p>
    <form class="card" data-form="turno" data-id="${item.id}">
      <p>${esc(item.motivo)} · ${esc(item.estado)}</p>
      <label class="campo">Nueva fecha
        <input name="fecha" type="datetime-local" required value="${esc(String(item.fecha).slice(0, 16))}">
      </label>
      <button class="btn" type="submit">Reprogramar</button>
    </form>`;
}

async function vistaFacturas() {
  const res = await api("/api/facturas");
  const filas = (res.data.facturas || []).map((item) => `
    <tr>
      <td><a href="#/facturas/${item.id}">${item.id}</a></td>
      <td>${esc(item.pacienteNombre)}</td>
      <td>${esc(item.concepto)}</td>
      <td>${pesos(item.monto)}</td>
      <td>${esc(item.estado)}</td>
    </tr>`).join("");
  return `
    <h1>Facturación</h1>
    <div class="card tabla-wrap">
      <table>
        <thead><tr><th>Nº</th><th>Paciente</th><th>Concepto</th><th>Importe</th><th>Estado</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="5">No hay facturas dentro de tu alcance.</td></tr>`}</tbody>
      </table>
    </div>
    ${buscarId("Abrir por número de factura", "#/facturas/", "201 es de Ana, 202 de Lucas y 203 de María.")}`;
}

async function vistaFactura(id) {
  const path = `/api/facturas/${id}`;
  const res = await api(path);
  if (!res.ok) return bloqueado("GET", path, res.status, res.data);
  const item = res.data.factura;
  const pagar = item.estado === "pendiente"
    ? `<button class="btn" type="button" data-accion="pagar" data-id="${item.id}">Registrar pago</button>`
    : `<p class="nota">Esta factura ya está pagada.</p>`;
  return `
    ${solicitud("GET", path, res.status)}
    <h1>Factura ${item.id}</h1>
    <article class="card">
      <h2>${pesos(item.monto)}</h2>
      <p>${esc(item.concepto)} · ${esc(item.pacienteNombre)} · paciente ${item.pacienteId}</p>
      <p>${esc(item.estado)}</p>
      ${pagar}
    </article>`;
}

function vistaReportes() {
  const sugerido = state.user.pacienteId || 3;
  return `
    <h1>Exportar reporte</h1>
    <p class="lead">El filtro viaja como <code>pacienteId</code>. En el modo vulnerable el servidor no recorta el alcance: devuelve clínica y facturación del número pedido.</p>
    <form class="card" data-form="exportar">
      <label class="campo">Número de paciente
        <input name="pacienteId" inputmode="numeric" value="${sugerido}" required>
      </label>
      <button class="btn" type="submit">Exportar</button>
      <div id="exportar-resultado"></div>
    </form>`;
}

function vistaPerfil() {
  const crudo = JSON.stringify({ nombre: state.user.nombre, rol: "sistemas", activo: true }, null, 2);
  return `
    <h1>Mi perfil</h1>
    <p class="lead">El formulario normal solo envía el nombre. El bloque de abajo envía el cuerpo tal cual, para mostrar la asignación masiva.</p>
    <form class="card" data-form="perfil">
      <p class="meta">${esc(state.user.email)} · rol en el servidor: ${esc(etiquetaRol(state.user.rol))}</p>
      <label class="campo">Nombre <input name="nombre" required value="${esc(state.user.nombre)}"></label>
      <button class="btn" type="submit">Guardar nombre</button>
    </form>
    <form class="card" data-form="perfil-crudo">
      <h2>Cuerpo sin lista de permitidos</h2>
      <label class="campo">JSON
        <textarea name="json">${esc(crudo)}</textarea>
      </label>
      <button class="btn-peligro" type="submit">Enviar campos de más</button>
      <div id="perfil-resultado">${state.perfilResultado}</div>
    </form>`;
}

async function vistaAdmin() {
  const path = "/api/admin/usuarios";
  const res = await api(path);
  if (!res.ok) return bloqueado("GET", path, res.status, res.data);
  const filas = res.data.usuarios.map((usuario) => {
    const opciones = ROLES.map(([valor, texto]) => `<option value="${valor}"${valor === usuario.rol ? " selected" : ""}>${texto}</option>`).join("");
    return `
      <tr data-usuario="${usuario.id}">
        <td>${esc(usuario.nombre)}<br><span class="meta">${esc(usuario.email)}</span></td>
        <td><select data-campo="rol">${opciones}</select></td>
        <td><input data-campo="activo" type="checkbox" ${usuario.activo ? "checked" : ""}></td>
        <td><button type="button" class="btn-secundario" data-accion="guardar-usuario" data-id="${usuario.id}">Guardar</button></td>
      </tr>`;
  }).join("");
  const auditoria = await api("/api/admin/auditoria");
  const eventos = (auditoria.data.auditoria || []).slice(0, 12).map((evento) => `
    <tr>
      <td>${fechaTurno(evento.fecha)}</td>
      <td>${esc(evento.usuario)}</td>
      <td>${esc(evento.accion)}</td>
      <td>${esc(evento.recurso)}</td>
      <td>${evento.permitido ? "sí" : "no"}</td>
    </tr>`).join("");
  return `
    ${solicitud("GET", path, res.status)}
    <h1>Usuarios y roles</h1>
    <p class="lead">En el modo vulnerable esta ruta solo comprueba que haya sesión. Cualquier cuenta que la conozca administra usuarios.</p>
    <div class="card tabla-wrap">
      <table>
        <thead><tr><th>Persona</th><th>Rol</th><th>Activa</th><th></th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <h2>Auditoría</h2>
    <div class="card tabla-wrap">
      <table>
        <thead><tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Recurso</th><th>Permitido</th></tr></thead>
        <tbody>${eventos || `<tr><td colspan="5">Todavía no hay eventos.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function resultadoGuia(id) {
  return `<div class="resultado-api" data-guia-resultado="${id}">${state.guia[id] || ""}</div>`;
}

function escenario(id, titulo, texto, botones) {
  const acciones = botones.map((boton) => `
    <button type="button" class="${boton.peligro ? "btn-peligro" : "btn"}" data-accion="guia" data-guia="${boton.guia}" data-destino="${id}">
      ${esc(boton.texto)}
    </button>`).join("");
  return `
    <article class="card">
      <h3>${esc(titulo)}</h3>
      <p>${texto}</p>
      <div class="fila">${acciones}</div>
      ${resultadoGuia(id)}
    </article>`;
}

function vistaGuia() {
  const narrada = state.user.email === "ana.paz@mediportal.test"
    ? ""
    : `<p class="aviso aviso-info">La guía está narrada con Ana Paz. Con otro rol, algunos accesos del modo seguro son legítimos: la Dra. Molina atiende a María, y administración ve todos los turnos y facturas.</p>`;
  return `
    <h1>Guía del práctico</h1>
    <p class="lead">Entrá como Ana, probá cada botón en modo vulnerable y repetilo en modo seguro. Restablecé los datos después de reprogramar, pagar o cambiar el rol: esas acciones modifican el laboratorio.</p>
    ${narrada}
    <div class="escenarios">
      ${escenario("historia", "IDOR en la historia clínica", "Ana pide la historia de María Soto, que no es suya. El número de paciente va en la ruta <code>/api/pacientes/3/historia</code>.", [{ guia: "historia-3", texto: "Pedir historia 3" }])}
      ${escenario("resultado", "IDOR en un resultado", "El archivo 3 es la ecografía de María. Conocer el número de archivo no debería alcanzar.", [{ guia: "resultado-3", texto: "Pedir resultado 3" }])}
      ${escenario("turno", "IDOR en turnos", "El turno 102 es de Lucas con el Dr. Herrera. Además de leerlo, se puede cambiar la fecha.", [{ guia: "turno-102", texto: "Ver turno 102" }, { guia: "reprogramar-102", texto: "Reprogramar turno 102", peligro: true }])}
      ${escenario("factura", "IDOR en facturas", "La factura 202 es la resonancia de Lucas. Registrar el pago modifica un comprobante ajeno.", [{ guia: "factura-202", texto: "Ver factura 202" }, { guia: "pagar-202", texto: "Pagar factura 202", peligro: true }])}
      ${escenario("export", "Exportación sin alcance", "El reporte acepta <code>pacienteId</code>. En modo vulnerable devuelve diagnósticos, estudios y facturas. En modo seguro, un paciente solo exporta lo propio; administración solo factura; la médica solo ve clínica de sus pacientes.", [{ guia: "export-3", texto: "Exportar paciente 3" }])}
      ${escenario("debug", "Endpoint de prueba", "<code>GET /api/internal/debug/users</code> no pide sesión en el modo vulnerable y lista las cuentas. En el modo seguro responde 404, como si se hubiera retirado.", [{ guia: "debug", texto: "Llamar sin sesión" }])}
      ${escenario("perfil", "Asignación masiva", "El perfil vulnerable copia <code>rol</code> y <code>activo</code> además del nombre. Después de esta prueba, Ana queda como sistemas hasta que restablezcas los datos. En modo seguro la petición se rechaza entera.", [{ guia: "perfil-rol", texto: "Enviar rol sistemas", peligro: true }])}
      ${escenario("admin", "Autorización por función", "La pantalla no está en el menú de Ana, pero la ruta <code>#/admin</code> existe. En modo vulnerable el servidor solo mira si hay sesión.", [{ guia: "admin", texto: "Listar usuarios" }, { guia: "ir-admin", texto: "Abrir #/admin" }])}
      ${escenario("navegador", "El rol en el navegador", "El menú lee <code>localStorage.mediportal_rol</code>. Cambiarlo muestra Administración aunque el servidor siga viendo a Ana como paciente. En modo seguro esa pantalla responde 403.", [{ guia: "rol-navegador", texto: "Mostrar menú de sistemas" }])}
    </div>`;
}

const VISTAS = {
  inicio: vistaInicio,
  historias: vistaHistorias,
  resultados: vistaResultados,
  turnos: vistaTurnos,
  facturas: vistaFacturas,
  reportes: vistaReportes,
  perfil: vistaPerfil,
  admin: vistaAdmin,
  guia: vistaGuia,
};

let renderSeq = 0;

async function render() {
  const seq = ++renderSeq;
  state.route = parseRoute();
  if (!state.user && state.route.name !== "login") {
    location.hash = "#/login";
    return;
  }
  if (state.user && state.route.name === "login") {
    location.hash = "#/inicio";
    return;
  }
  const modo = await api("/api/lab/modo", { auth: false });
  if (seq !== renderSeq) return;
  if (modo.ok) state.modo = modo.data.modo;
  if (state.user) {
    const yo = await api("/api/auth/yo");
    if (seq !== renderSeq) return;
    if (!yo.ok) return;
    guardarUsuario(yo.data.usuario);
  }
  document.title = "MediPortal";
  let html = "";
  if (!state.user) html = vistaLogin();
  else {
    const route = state.route;
    let vista;
    if (route.name === "historias" && route.id) vista = vistaHistoria(route.id);
    else if (route.name === "resultados" && route.id) vista = vistaResultado(route.id);
    else if (route.name === "turnos" && route.id) vista = vistaTurno(route.id);
    else if (route.name === "facturas" && route.id) vista = vistaFactura(route.id);
    else vista = (VISTAS[route.name] || vistaInicio)();
    html = shell(await vista);
  }
  if (seq !== renderSeq) return;
  document.getElementById("app").innerHTML = html;
}

function interpretar(status) {
  if (status === 200 || status === 201) {
    return state.modo === "vulnerable"
      ? "La API devolvió o modificó el recurso. Si no te pertenece, faltó la autorización por identificador o por función."
      : "La API permitió la operación. Si entraste con un rol que sí corresponde, el acceso es legítimo. Repetila con Ana Paz para ver el rechazo.";
  }
  if (status === 403) return "El servidor autenticó la sesión y rechazó la operación. Ese es el control que en el modo vulnerable no existe.";
  if (status === 404) return "La ruta responde como inexistente. El endpoint de prueba no queda publicado en el modo seguro.";
  if (status === 400) return "El servidor rechazó el contenido. En el perfil, esto ocurre cuando llegan campos fuera de la lista permitida.";
  if (status === 401) return "No hay una sesión válida.";
  return "Revisá el código HTTP y el cuerpo de la respuesta.";
}

async function correrGuia(guia, destino) {
  if (guia === "ir-admin") {
    location.hash = "#/admin";
    return;
  }
  if (guia === "rol-navegador") {
    state.rolUi = "sistemas";
    localStorage.setItem("mediportal_rol", "sistemas");
    state.aviso = {
      tipo: "info",
      texto: "El menú ahora muestra Administración. El servidor no cambió tu rol. Abrí esa pantalla.",
    };
    render();
    return;
  }
  const acciones = {
    "historia-3": ["GET", "/api/pacientes/3/historia", { method: "GET" }],
    "resultado-3": ["GET", "/api/resultados/3", { method: "GET" }],
    "turno-102": ["GET", "/api/turnos/102", { method: "GET" }],
    "reprogramar-102": ["PATCH", "/api/turnos/102", { method: "PATCH", body: { fecha: "2026-12-01T08:00" } }],
    "factura-202": ["GET", "/api/facturas/202", { method: "GET" }],
    "pagar-202": ["POST", "/api/facturas/202/pagar", { method: "POST", body: {} }],
    "export-3": ["GET", "/api/reportes/export?pacienteId=3", { method: "GET" }],
    debug: ["GET", "/api/internal/debug/users", { method: "GET", auth: false }],
    "perfil-rol": ["PUT", "/api/perfil", {
      method: "PUT",
      body: { nombre: state.user.nombre, rol: "sistemas", activo: true },
    }],
    admin: ["GET", "/api/admin/usuarios", { method: "GET" }],
  };
  const accion = acciones[guia];
  if (!accion) return;
  const caja = document.querySelector(`[data-guia-resultado="${destino}"]`);
  if (caja) caja.textContent = "Consultando…";
  const [metodo, path, opts] = accion;
  const res = await api(path, opts);
  if (res.data?.usuario) guardarUsuario(res.data.usuario);
  const html = `${bloqueApi(metodo, path, res.status, res.data)}<p class="nota">${esc(interpretar(res.status))}</p>`;
  state.guia[destino] = html;
  if (guia === "perfil-rol") {
    state.aviso = {
      tipo: res.ok ? "info" : "ok",
      texto: res.ok
        ? "El servidor aceptó el rol. Restablecé los datos antes de seguir, o Ana va a quedar como sistemas."
        : "El servidor rechazó los campos que no están permitidos.",
    };
    render();
    return;
  }
  const actual = document.querySelector(`[data-guia-resultado="${destino}"]`);
  if (actual) actual.innerHTML = html;
}

document.addEventListener("click", async (evento) => {
  const el = evento.target.closest("[data-accion]");
  if (!el || !document.getElementById("app").contains(el)) return;
  const accion = el.dataset.accion;
  if (accion === "modo") {
    await api("/api/lab/modo", { method: "POST", body: { modo: el.dataset.modo }, auth: false });
    state.guia = {};
    state.perfilResultado = "";
    state.aviso = {
      tipo: "info",
      texto: el.dataset.modo === "seguro"
        ? "Modo seguro activo. Los datos anteriores siguen hasta que restablezcas."
        : "Modo vulnerable activo.",
    };
    render();
    return;
  }
  if (accion === "restablecer") {
    await api("/api/lab/restablecer", { method: "POST", auth: false });
    state.guia = {};
    state.perfilResultado = "";
    state.aviso = { tipo: "ok", texto: "Datos y roles vueltos al estado inicial." };
    render();
    return;
  }
  if (accion === "salir") {
    await api("/api/auth/salir", { method: "POST", body: {} });
    clearSession();
    location.hash = "#/login";
    return;
  }
  if (accion === "sincronizar-rol") {
    state.rolUi = state.user.rol;
    localStorage.setItem("mediportal_rol", state.rolUi);
    render();
    return;
  }
  if (accion === "guia") {
    await correrGuia(el.dataset.guia, el.dataset.destino);
    return;
  }
  if (accion === "pagar") {
    const id = el.dataset.id;
    const res = await api(`/api/facturas/${id}/pagar`, { method: "POST", body: {} });
    state.aviso = {
      tipo: res.ok ? "ok" : "error",
      texto: res.ok ? "El pago quedó registrado." : (res.data.error || "No se pudo registrar el pago."),
    };
    render();
    return;
  }
  if (accion === "guardar-usuario") {
    const fila = el.closest("tr");
    const rol = fila.querySelector("[data-campo=rol]").value;
    const activo = fila.querySelector("[data-campo=activo]").checked;
    const res = await api(`/api/admin/usuarios/${el.dataset.id}`, { method: "PATCH", body: { rol, activo } });
    state.aviso = {
      tipo: res.ok ? "ok" : "error",
      texto: res.ok ? "Usuario actualizado." : (res.data.error || "No se pudo actualizar."),
    };
    render();
  }
});

document.addEventListener("change", (evento) => {
  if (!evento.target.matches("[data-rol-ui]")) return;
  state.rolUi = evento.target.value;
  localStorage.setItem("mediportal_rol", state.rolUi);
  render();
});

document.addEventListener("submit", async (evento) => {
  const form = evento.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.form) return;
  evento.preventDefault();
  const datos = new FormData(form);
  if (form.dataset.form === "login") {
    const res = await api("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { email: datos.get("email"), password: datos.get("password") },
    });
    const error = document.getElementById("login-error");
    if (!res.ok) {
      if (error) {
        error.hidden = false;
        error.textContent = res.data.error || "No se pudo ingresar.";
      }
      return;
    }
    setSession(res.data);
    location.hash = "#/inicio";
    return;
  }
  if (form.dataset.form === "ir") {
    const id = String(datos.get("id") || "").trim();
    if (!/^[1-9]\d*$/.test(id)) return;
    location.hash = `${form.dataset.base}${id}`;
    return;
  }
  if (form.dataset.form === "diagnostico") {
    const res = await api(`/api/pacientes/${form.dataset.paciente}/historia`, {
      method: "POST",
      body: { diagnostico: datos.get("diagnostico"), notas: datos.get("notas") },
    });
    state.aviso = {
      tipo: res.ok ? "ok" : "error",
      texto: res.ok ? "El diagnóstico quedó en la historia." : (res.data.error || "No se pudo guardar."),
    };
    render();
    return;
  }
  if (form.dataset.form === "turno") {
    const res = await api(`/api/turnos/${form.dataset.id}`, {
      method: "PATCH",
      body: { fecha: datos.get("fecha") },
    });
    state.aviso = {
      tipo: res.ok ? "ok" : "error",
      texto: res.ok ? "Turno reprogramado." : (res.data.error || "No se pudo reprogramar."),
    };
    render();
    return;
  }
  if (form.dataset.form === "exportar") {
    const path = `/api/reportes/export?pacienteId=${encodeURIComponent(datos.get("pacienteId"))}`;
    const res = await api(path);
    const caja = document.getElementById("exportar-resultado");
    if (caja) caja.innerHTML = bloqueApi("GET", path, res.status, res.data);
    return;
  }
  if (form.dataset.form === "perfil") {
    const res = await api("/api/perfil", { method: "PUT", body: { nombre: datos.get("nombre") } });
    if (res.data?.usuario) guardarUsuario(res.data.usuario);
    state.aviso = {
      tipo: res.ok ? "ok" : "error",
      texto: res.ok ? "Nombre actualizado." : (res.data.error || "No se pudo guardar."),
    };
    render();
    return;
  }
  if (form.dataset.form === "perfil-crudo") {
    let cuerpo;
    try {
      cuerpo = JSON.parse(String(datos.get("json") || ""));
    } catch {
      state.perfilResultado = `<p class="error">Ese texto no es JSON válido.</p>`;
      render();
      return;
    }
    const res = await api("/api/perfil", { method: "PUT", body: cuerpo });
    if (res.data?.usuario) guardarUsuario(res.data.usuario);
    state.perfilResultado = bloqueApi("PUT", "/api/perfil", res.status, res.data);
    state.aviso = res.ok && res.data.aviso ? { tipo: "info", texto: res.data.aviso } : null;
    render();
  }
});

window.addEventListener("hashchange", () => {
  state.aviso = null;
  render();
});

if (!location.hash) location.hash = state.user ? "#/inicio" : "#/login";
else render();
