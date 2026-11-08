import { pacientesDelMedico } from "./datos.js";

function esVulnerable(modo) {
  return modo === "vulnerable";
}

export function puedeLeerClinico(usuario, pacienteId, modo) {
  if (esVulnerable(modo)) return true;
  if (usuario.rol === "paciente") return usuario.pacienteId === pacienteId;
  if (usuario.rol === "medico") return pacientesDelMedico(usuario.id).includes(pacienteId);
  return false;
}

export function puedeEscribirClinico(usuario, pacienteId, modo) {
  if (esVulnerable(modo)) return true;
  return usuario.rol === "medico" && pacientesDelMedico(usuario.id).includes(pacienteId);
}

export function puedeVerTurno(usuario, turno, modo) {
  if (esVulnerable(modo)) return true;
  if (usuario.rol === "paciente") return usuario.pacienteId === turno.pacienteId;
  if (usuario.rol === "medico") return turno.medicoId === usuario.id;
  if (usuario.rol === "administrativo") return true;
  return false;
}

export function puedeReprogramarTurno(usuario, turno, modo) {
  if (esVulnerable(modo)) return true;
  if (usuario.rol === "administrativo") return true;
  if (usuario.rol === "paciente") return usuario.pacienteId === turno.pacienteId;
  if (usuario.rol === "medico") return turno.medicoId === usuario.id;
  return false;
}

export function puedeVerFactura(usuario, factura, modo) {
  if (esVulnerable(modo)) return true;
  if (usuario.rol === "paciente") return usuario.pacienteId === factura.pacienteId;
  if (usuario.rol === "administrativo") return true;
  return false;
}

export function alcanceExportacion(usuario, pacienteId, modo) {
  if (esVulnerable(modo)) return "completo";
  if (usuario.rol === "paciente" && usuario.pacienteId === pacienteId) return "propio";
  if (usuario.rol === "medico" && pacientesDelMedico(usuario.id).includes(pacienteId)) return "clinico";
  if (usuario.rol === "administrativo") return "facturacion";
  return null;
}

export function puedeAdministrarUsuarios(usuario, modo) {
  if (esVulnerable(modo)) return true;
  return usuario.rol === "sistemas";
}

export function historiasVisibles(store, usuario) {
  if (usuario.rol === "paciente") {
    return store.historias.filter((item) => item.pacienteId === usuario.pacienteId);
  }
  if (usuario.rol === "medico") {
    const propios = new Set(pacientesDelMedico(usuario.id));
    return store.historias.filter((item) => propios.has(item.pacienteId));
  }
  return [];
}

export function resultadosVisibles(store, usuario) {
  if (usuario.rol === "paciente") {
    return store.resultados.filter((item) => item.pacienteId === usuario.pacienteId);
  }
  if (usuario.rol === "medico") {
    const propios = new Set(pacientesDelMedico(usuario.id));
    return store.resultados.filter((item) => propios.has(item.pacienteId));
  }
  return [];
}

export function turnosVisibles(store, usuario) {
  if (usuario.rol === "paciente") {
    return store.turnos.filter((item) => item.pacienteId === usuario.pacienteId);
  }
  if (usuario.rol === "medico") {
    return store.turnos.filter((item) => item.medicoId === usuario.id);
  }
  if (usuario.rol === "administrativo") return store.turnos;
  return [];
}

export function facturasVisibles(store, usuario) {
  if (usuario.rol === "paciente") {
    return store.facturas.filter((item) => item.pacienteId === usuario.pacienteId);
  }
  if (usuario.rol === "administrativo") return store.facturas;
  return [];
}
