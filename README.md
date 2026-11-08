# MediPortal — Broken Access Control

Trabajo práctico de seguridad. MediPortal es el portal ficticio de una red de clínicas: pacientes consultan turnos, resultados e historia clínica; los médicos registran diagnósticos; administración gestiona agenda y facturación; sistemas administra usuarios y roles.

El valor del sistema depende de que cada persona vea solo lo que le corresponde. El laboratorio muestra la falla cuando esa decisión no está en el servidor, y la corrección cuando sí lo está.

Los datos son ficticios. El sistema corre en la máquina local y no está pensado para publicar información real.

## Tecnologías

El práctico es una aplicación web de una sola carpeta. No usa framework de interfaz ni base de datos.

| Capa | Tecnología | Para qué |
| --- | --- | --- |
| Entorno | Node.js 18 o superior, módulos ES | Ejecuta el servidor con `node server/index.js` |
| Servidor y API | Express 4 | Rutas REST, JSON y el portal estático |
| Claves | bcryptjs | Guarda la clave de demostración como hash. El endpoint de prueba no la devuelve |
| Interfaz | HTML, CSS y JavaScript | Páginas del portal, sin React ni otro framework |
| Datos | Memoria del proceso | Pacientes, historias, turnos y facturas se reinician con **Restablecer datos** |
| Sesión | Token aleatorio | Viaja en `Authorization: Bearer`. El servidor no lee el rol guardado en el navegador |

Las políticas vulnerable y segura están en `server/autorizacion.js`. Las rutas que las aplican están en `server/index.js`. La pantalla está en `public/`.

## Cómo ejecutarlo

Requiere Node.js 18 o superior.

```bash
npm install
npm start
```

Abrir http://localhost:3000.

La clave de todas las cuentas es `portal`.

| Persona | Rol | Correo |
| --- | --- | --- |
| Ana Paz | Paciente (nº 1) | ana.paz@mediportal.test |
| Lucas Díaz | Paciente (nº 2) | lucas.diaz@mediportal.test |
| Dra. Elena Molina | Médica de Ana y de María | dra.molina@mediportal.test |
| Carlos Ruiz | Administración | carlos.ruiz@mediportal.test |
| Nora Vidal | Sistemas | nora.vidal@mediportal.test |

María Soto es la paciente nº 3. No tiene usuario del portal, pero tiene historia, un estudio y una factura. Su historia describe un control prenatal: sirve para ver el impacto de leer un recurso ajeno.

La Dra. Molina no atiende a Lucas. El turno 102 y la factura 202 son de Lucas. El turno 101 y la factura 201 son de Ana. El archivo de resultado 3 es la ecografía de María.

```bash
npm run verificar
```

Ese comando recorre la API en los dos modos y falla si un control no responde como está descripto acá.

## Los dos modos

El interruptor **Vulnerable / Seguro** cambia la política del servidor. No es una protección mágica: las dos políticas están en `server/autorizacion.js` y las rutas de `server/index.js` llaman a esas funciones.

- **Vulnerable:** si hay sesión, se puede leer o modificar un recurso conociendo su número. El perfil copia campos de más. Las rutas de administración no miran el rol. El endpoint de prueba responde.
- **Seguro:** cada recurso se autoriza por rol y por pertenencia. El perfil solo acepta el nombre. Administración exige el rol `sistemas`. El endpoint de prueba responde 404.

Las listas del inicio están filtradas en los dos modos. El portal se ve bien y el fallo queda en el acceso directo, que es la forma habitual de esta falla: la pantalla lista “lo mío”, pero `GET /api/pacientes/3/historia` no pregunta de quién es.

Los botones del laboratorio (`/api/lab/modo` y `/api/lab/restablecer`) existen para la demostración. No forman parte del portal que se evalúa.

## Recorrido para la defensa

1. Entrar como Ana Paz, con el modo vulnerable.
2. Abrir **Guía del práctico** y ejecutar cada prueba.
3. Pasar a modo seguro, sin cambiar de cuenta, y repetir las mismas pruebas.
4. Si se reprogramó un turno, se pagó una factura o se cambió un rol, usar **Restablecer datos** antes de seguir. El modo seguro no deshace lo que el modo vulnerable ya escribió.
5. Entrar como Dra. Molina, Carlos y Nora para mostrar la separación de funciones: la médica no ve facturas, administración no ve historias y sistemas no ve datos clínicos.

## Análisis

### IDOR: historia, resultados, turnos y facturas

El control de acceso roto ocupa el primer lugar del OWASP Top 10 porque la aplicación sabe quién inició sesión y, aun así, entrega o modifica el recurso que indique el identificador. Esa variante se llama IDOR o BOLA: la referencia directa al objeto no se contrasta con el usuario.

En MediPortal aparece en:

- `GET` y `POST /api/pacientes/:id/historia`
- `GET /api/resultados/:id`
- `GET` y `PATCH /api/turnos/:id`
- `GET /api/facturas/:id` y `POST /api/facturas/:id/pagar`

En modo vulnerable, `puedeLeerClinico`, `puedeVerTurno` y `puedeVerFactura` devuelven verdadero para cualquier sesión. Ana puede leer el control prenatal de María, reprogramar el turno de Lucas y pagar la factura 202.

En modo seguro la misma función mira el rol:

- Un paciente solo accede a su `pacienteId`.
- La médica solo lee y escribe clínica de las pacientes que tiene en `asignaciones`, y solo ve los turnos donde ella es la profesional.
- Administración ve agenda y facturas, y no ve historia ni resultados.
- Sistemas no ve clínica ni facturación.

El impacto es el que describe la propuesta: filtración de datos de salud, modificación de registros ajenos y un pago aplicado al comprobante de otra persona. La respuesta 403 no incluye el contenido del recurso.

### Exportación con un filtro de paciente

`GET /api/reportes/export?pacienteId=` arma un reporte del número que llegue en la consulta.

En modo vulnerable el alcance es `completo`: diagnósticos, estudios y facturas. En modo seguro `alcanceExportacion` recorta:

- paciente: solo el propio, clínica y sus facturas;
- médica: solo clínica de sus pacientes, sin facturas;
- administración: facturas de cualquier paciente, sin diagnósticos ni estudios;
- sistemas: sin exportación.

### Endpoint de prueba

`GET /api/internal/debug/users` representa un diagnóstico que quedó publicado. En modo vulnerable no pide sesión y devuelve nombre, correo, rol y estado de cada cuenta. No devuelve la clave ni su hash. En modo seguro la misma ruta responde 404.

### Asignación masiva

`PUT /api/perfil` actualiza la cuenta de quien está autenticado. En modo vulnerable copia al usuario todos los campos del cuerpo, salvo `id`, `password` y `passwordHash`. Con este cuerpo Ana pasa a ser de sistemas y, si también manda `pacienteId`, las listas “seguras” empiezan a mostrar la historia de otra persona porque el filtro confía en ese dato:

```json
{ "nombre": "Ana Paz", "rol": "sistemas", "activo": true, "pacienteId": 2 }
```

También se puede mandar `activo: false` y dejar la cuenta inutilizable.

En modo seguro la ruta tiene una lista blanca: solo `nombre`. Si llega `rol`, `activo` o cualquier otro campo, responde 400 con `CAMPOS_NO_PERMITIDOS` y no escribe nada. El rol de una cuenta se cambia únicamente en `PATCH /api/admin/usuarios/:id`, y solo con permiso de sistemas.

### Autorización por función

`GET /api/admin/usuarios`, `PATCH /api/admin/usuarios/:id` y `GET /api/admin/auditoria` administran cuentas. En modo vulnerable `puedeAdministrarUsuarios` es verdadero para cualquier sesión: Ana puede listar cuentas y desactivar a Lucas aunque el menú no muestre Administración. En modo seguro la función exige `rol === "sistemas"`.

La auditoría registra lecturas y escrituras sensibles, permitidas y rechazadas, sin copiar el contenido clínico. En modo seguro solo sistemas la consulta. Sirve para la trazabilidad que el portal necesita: quién intentó ver cada recurso.

### El frontend no autoriza

El menú se arma con `localStorage.mediportal_rol`, no con una decisión del servidor. El selector **Rol guardado en el navegador**, en la barra lateral, cambia esa clave. El menú pasa a mostrar Administración y el servidor sigue viendo el rol de la sesión.

`#/admin` se puede abrir escribiendo la ruta aunque el enlace no esté. En modo vulnerable la API responde 200. En modo seguro responde 403 y la pantalla muestra el rechazo: la vista se abrió, el dato no.

Los números de paciente, archivo, turno y factura están en el hash (`#/historias/3`, `#/resultados/3`) y en la solicitud (`GET /api/pacientes/3/historia`). Hay un campo para abrir por número en cada sección. Cambiar ese número es la prueba. Ocultar el enlace o no dibujar el botón sería usabilidad, no un control: por eso el modo vulnerable igual muestra el formulario de diagnóstico.

La sesión viaja en `Authorization: Bearer`, no en una cookie. El servidor no lee el rol del navegador.

## Qué queda a propósito fuera de este trabajo

Las listas filtradas, el hash de la clave y el bloqueo de `passwordHash` en el perfil evitan que el laboratorio se rompa o filtre la clave. No reemplazan la autorización por recurso. Quedan fuera de alcance otras fallas (inyección, CSRF sobre cookies, XSS) porque el práctico estudia control de acceso.

El modo es global al proceso de Node. Dos ventanas comparten Vulnerable o Seguro. **Restablecer datos** vuelve pacientes, turnos, facturas y roles al estado inicial, y no cierra la sesión.
