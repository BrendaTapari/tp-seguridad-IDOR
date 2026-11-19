import bcrypt from "bcryptjs";

const CLAVE_DEMO = "portal";
let hashDemo = null;

function claveDemo() {
  if (!hashDemo) hashDemo = bcrypt.hashSync(CLAVE_DEMO, 8);
  return hashDemo;
}

function crearSemilla() {
  const passwordHash = claveDemo();
  const usuario = (datos) => ({ passwordHash, activo: true, pacienteId: null, ...datos });

  return {
    proximoAuditoria: 1,
    usuarios: [
      usuario({
        id: 1,
        email: "ana.paz@mediportal.test",
        nombre: "Ana Paz",
        rol: "paciente",
        pacienteId: 1,
      }),
      usuario({
        id: 2,
        email: "lucas.diaz@mediportal.test",
        nombre: "Lucas Díaz",
        rol: "paciente",
        pacienteId: 2,
      }),
      usuario({
        id: 3,
        email: "dra.molina@mediportal.test",
        nombre: "Dra. Elena Molina",
        rol: "medico",
        matricula: "MN 45210",
      }),
      usuario({
        id: 4,
        email: "carlos.ruiz@mediportal.test",
        nombre: "Carlos Ruiz",
        rol: "administrativo",
      }),
      usuario({
        id: 5,
        email: "nora.vidal@mediportal.test",
        nombre: "Nora Vidal",
        rol: "sistemas",
      }),
    ],
    pacientes: [
      { id: 1, nombre: "Ana Paz", dni: "30.111.222", obraSocial: "OSDE 210" },
      { id: 2, nombre: "Lucas Díaz", dni: "28.999.888", obraSocial: "Swiss Medical" },
      { id: 3, nombre: "María Soto", dni: "35.444.210", obraSocial: "Galeno" },
    ],
    asignaciones: [
      { medicoId: 3, pacienteId: 1 },
      { medicoId: 3, pacienteId: 3 },
    ],
    historias: [
      {
        id: 1,
        pacienteId: 1,
        medicoId: 3,
        fecha: "2026-03-12",
        diagnostico: "Hipertensión leve",
        gravedad: "estable",
        notas: "Control anual. PA 138/88. Se indica dieta hiposódica y control en 6 meses.",
      },
      {
        id: 2,
        pacienteId: 2,
        medicoId: 9,
        fecha: "2026-06-02",
        diagnostico: "Lumbalgia aguda",
        gravedad: "critico",
        notas: "Dolor lumbar de 10 días. Antecedente de hernia de disco en 2024. Se indica reposo y analgesia.",
      },
      {
        id: 3,
        pacienteId: 3,
        medicoId: 3,
        fecha: "2026-09-18",
        diagnostico: "Embarazo de 12 semanas",
        gravedad: "seguimiento",
        notas: "Control prenatal. Embarazo único, sin antecedentes de riesgo. Próxima ecografía en 4 semanas.",
      },
    ],
    resultados: [
      {
        id: 1,
        pacienteId: 1,
        tipo: "Hemograma",
        fecha: "2026-03-10",
        estado: "Disponible",
        resumen: "Hemoglobina 13.8 g/dL. Leucocitos dentro de rango.",
      },
      {
        id: 2,
        pacienteId: 2,
        tipo: "Resonancia lumbar",
        fecha: "2026-06-05",
        estado: "Disponible",
        resumen: "Protrusión discal L4-L5. Sin compromiso radicular agudo.",
      },
      {
        id: 3,
        pacienteId: 3,
        tipo: "Ecografía obstétrica",
        fecha: "2026-09-20",
        estado: "Disponible",
        resumen: "Embarazo único, vital, acorde a 12 semanas.",
      },
    ],
    turnos: [
      {
        id: 101,
        pacienteId: 1,
        medicoId: 3,
        fecha: "2026-11-20T09:30:00",
        motivo: "Control de presión",
        estado: "confirmado",
      },
      {
        id: 102,
        pacienteId: 2,
        medicoId: 9,
        fecha: "2026-11-20T10:00:00",
        motivo: "Seguimiento de lumbalgia",
        estado: "confirmado",
      },
      {
        id: 103,
        pacienteId: 3,
        medicoId: 3,
        fecha: "2026-11-21T11:15:00",
        motivo: "Control prenatal",
        estado: "confirmado",
      },
    ],
    facturas: [
      { id: 201, pacienteId: 1, concepto: "Consulta clínica", monto: 28000, estado: "pendiente" },
      { id: 202, pacienteId: 2, concepto: "Resonancia lumbar", monto: 95000, estado: "pendiente" },
      { id: 203, pacienteId: 3, concepto: "Ecografía obstétrica", monto: 42000, estado: "pagada" },
    ],
    auditoria: [],
  };
}

let datosListos = false;
export const store = {};

export const lab = {
  modo: "vulnerable",
};

export function init() {
  if (datosListos) return;
  datosListos = true;
  restablecer();
}

export function restablecer() {
  const copia = structuredClone(crearSemilla());
  for (const clave of Object.keys(store)) delete store[clave];
  Object.assign(store, copia);
}

export function usuarioPublico(usuario) {
  if (!usuario) return null;
  return {
    id: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    rol: usuario.rol,
    activo: usuario.activo,
    pacienteId: usuario.pacienteId,
    matricula: usuario.matricula ?? null,
  };
}

export function buscarUsuarioPorEmail(email) {
  return store.usuarios.find((usuario) => usuario.email === String(email || "").trim().toLowerCase());
}

export function buscarUsuario(id) {
  return store.usuarios.find((usuario) => usuario.id === id);
}

export function buscarPaciente(id) {
  return store.pacientes.find((paciente) => paciente.id === id);
}

export function nombrePaciente(id) {
  return buscarPaciente(id)?.nombre ?? "Paciente";
}

export function nombreMedico(id) {
  const usuario = store.usuarios.find((item) => item.id === id);
  if (usuario) return usuario.nombre;
  if (id === 9) return "Dr. Julián Herrera";
  return "Profesional no informado";
}

export function pacientesDelMedico(medicoId) {
  return store.asignaciones.filter((item) => item.medicoId === medicoId).map((item) => item.pacienteId);
}

export function vistaPaciente(paciente, { incluirDni = false } = {}) {
  if (!paciente) return null;
  const vista = {
    id: paciente.id,
    nombre: paciente.nombre,
    obraSocial: paciente.obraSocial,
  };
  if (incluirDni) vista.dni = paciente.dni;
  return vista;
}

export function vistaHistoria(historia) {
  return {
    id: historia.id,
    pacienteId: historia.pacienteId,
    pacienteNombre: nombrePaciente(historia.pacienteId),
    medicoNombre: nombreMedico(historia.medicoId),
    fecha: historia.fecha,
    diagnostico: historia.diagnostico,
    notas: historia.notas,
  };
}

export function vistaResultado(resultado) {
  return {
    id: resultado.id,
    pacienteId: resultado.pacienteId,
    pacienteNombre: nombrePaciente(resultado.pacienteId),
    tipo: resultado.tipo,
    fecha: resultado.fecha,
    estado: resultado.estado,
    resumen: resultado.resumen,
  };
}

export function vistaTurno(turno) {
  return {
    id: turno.id,
    pacienteId: turno.pacienteId,
    pacienteNombre: nombrePaciente(turno.pacienteId),
    medicoNombre: nombreMedico(turno.medicoId),
    fecha: turno.fecha,
    motivo: turno.motivo,
    estado: turno.estado,
  };
}

export function vistaFactura(factura) {
  return {
    id: factura.id,
    pacienteId: factura.pacienteId,
    pacienteNombre: nombrePaciente(factura.pacienteId),
    concepto: factura.concepto,
    monto: factura.monto,
    estado: factura.estado,
  };
}

export function siguienteId(lista) {
  return lista.reduce((maximo, item) => Math.max(maximo, item.id), 0) + 1;
}

export function auditar({ usuario, accion, recurso, permitido, detalle = "" }) {
  store.auditoria.unshift({
    id: store.proximoAuditoria++,
    fecha: new Date().toISOString(),
    usuario: usuario ? usuario.nombre : "anónimo",
    rol: usuario?.rol ?? null,
    accion,
    recurso,
    permitido: Boolean(permitido),
    detalle,
  });
  if (store.auditoria.length > 200) store.auditoria.length = 200;
}

export const ROLES = ["paciente", "medico", "administrativo", "sistemas"];

init();
