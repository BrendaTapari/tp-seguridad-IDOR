# MediPortal — Broken Access Control

Trabajo práctico de seguridad. MediPortal es el portal ficticio de una red de clínicas, en el cual el pacientes consultan turnos, resultados e historia clínica; los médicos registran diagnósticos; administración gestiona agenda y facturación; sistemas administra usuarios y roles.

El valor del sistema depende de que cada persona vea solo lo que le corresponde. El laboratorio muestra la falla cuando esa decisión no está en el servidor, y la corrección cuando sí lo está.

Los datos son ficticios. El sistema corre de firna local.

## Tecnologías

El práctico es una aplicación web de una sola carpeta. No usa framework de interfaz ni base de datos.

| Capa | Tecnología | Para qué |
| --- | --- | --- |
| Entorno | Node.js 18 o superior, módulos ES | Ejecuta el servidor con `node server/index.js` |
| Servidor y API | Express 4 | Rutas REST, JSON y el portal estático |
| Claves | bcryptjs | Guarda la clave de demostración como hash. El endpoint de prueba no la devuelve |
| Interfaz | HTML, CSS y JavaScript | Páginas del portal, sin React ni otro framework |
| Datos | Memoria del proceso | Pacientes, historias, turnos y facturas se reinician con **Restablecer datos** |
| Sesión | Token aleatorio | Viaja en `Authorization: Bearer`. El rol es el de la cuenta en el servidor |

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

## Los roles

El permiso lo decide el rol de la sesión: el de la cuenta con la que entraste. Esas reglas están en `server/autorizacion.js`. El menú, en `public/app.js` (la lista `ENLACES`), muestra las pantallas de ese mismo rol.

## Cómo cambiar un rol

**Mi perfil** no ofrece un rol para elegir. El formulario manda solo el nombre. El rol se agrega en la petición, desde las herramientas del navegador, que es lo que se hace al interceptar un sistema.

1. Entrá, abrí **Mi perfil** y presioná F12 → **Red** (Network).
2. Presioná **Guardar nombre**. Aparece `PUT /api/perfil` con un cuerpo `{ "nombre": "Ana Paz" }`.
3. Editá y reenviá esa petición. En Firefox: clic derecho sobre `perfil` → **Editar y reenviar**. El cuerpo queda así:

```json
{ "nombre": "Ana Paz", "rol": "sistemas", "activo": true }
```

El campo `rol` solo acepta estos valores:

| Rol | Valor en el JSON |
| --- | --- |
| Paciente | `paciente` |
| Médica / médico | `medico` |
| Administración | `administrativo` |
| Sistemas | `sistemas` |

En modo vulnerable el servidor guarda `rol` y `activo`, y el menú pasa a ser el de ese rol. En modo seguro responde 400 y no guarda nada.

Para cambiar el rol de otra persona, entrá con Nora Vidal (`nora.vidal@mediportal.test`, clave `portal`) y abrí **Administración**. Cada fila se guarda con `PATCH /api/admin/usuarios/:id`. En modo seguro solo Sistemas puede hacerlo. En modo vulnerable esa pantalla responde a cualquier sesión que abra `#/admin`.

**Administración** nombra dos cosas distintas. El rol Administración (`administrativo`, Carlos Ruiz) gestiona agenda y facturas. El ítem de menú Administración (`#/admin`) es la pantalla de usuarios y roles, y en el menú solo aparece para Sistemas.

La tabla es el modo seguro. En modo vulnerable, una sesión alcanza para leer o modificar un recurso si se conoce el número, aunque el menú no muestre la pantalla.

| Rol | Pantallas del menú | En modo seguro puede | Queda fuera |
| --- | --- | --- | --- |
| Paciente | Inicio, Historias clínicas, Resultados, Turnos, Facturación, Reportes, Mi perfil | Ver su historia y sus resultados, ver y reprogramar sus turnos, ver y pagar sus facturas, exportar lo propio (clínica y facturas) | Datos de otra persona, escribir diagnósticos, usuarios |
| Médica / médico | Las del paciente, sin Facturación | Ver y escribir la historia de sus pacientes asignados, ver sus resultados, ver y reprogramar los turnos de su agenda, exportar solo la clínica de esos pacientes | Facturas, pacientes que no tiene asignados, usuarios |
| Administración | Inicio, Turnos, Facturación, Reportes, Mi perfil | Ver y reprogramar cualquier turno, ver y pagar cualquier factura, exportar las facturas de cualquier paciente | Historias, resultados, diagnósticos, estudios, usuarios |
| Sistemas | Inicio, Mi perfil, Administración | Listar usuarios, cambiarles el rol y el estado, leer la auditoría | Historias, resultados, turnos, facturas, reportes |

La Guía del práctico está en el menú de los cuatro roles. Es del laboratorio, no de la clínica.

El rol solo no alcanza: también importa de quién es el recurso.

- Ana es la paciente 1 y Lucas es la 2. Cada uno opera ese `pacienteId`.
- La Dra. Molina atiende a Ana y a María Soto. No atiende a Lucas. El turno 102 y la factura 202 son de Lucas, con el Dr. Herrera, que no tiene usuario del portal. El turno 101 y la factura 201 son de Ana.
- María Soto es la paciente 3. No tiene correo para entrar. Tiene historia, la ecografía (resultado 3), el turno 103 y la factura 203. Su historia es un control prenatal: es el recurso ajeno que pide la guía.

```bash
npm run verificar
```

Ese comando recorre la API en los dos modos y falla si un control no responde como está descripto acá.

## Los dos modos

El interruptor **Vulnerable / Seguro** guarda `lab.modo` en el servidor (`server/datos.js`). El botón manda `POST /api/lab/modo` con `{ "modo": "seguro" }` o `"vulnerable"`. La cuenta sigue igual, el menú sigue igual y lo ya escrito queda escrito. El modo es uno para todo el proceso: dos ventanas ven el mismo.

Cada ruta de `server/index.js` llama a una función de `server/autorizacion.js` y le pasa ese modo. Todas empiezan así:

```js
if (esVulnerable(modo)) return true;
```

En vulnerable la función termina ahí: hay sesión y el número alcanza. En seguro esa línea no corta y corre la validación de abajo. El detalle de cada falla está en [Análisis](#análisis); esta es la lista de lo que el modo seguro comprueba.

| Qué se pide | Dónde | Validación en modo seguro |
| --- | --- | --- |
| Historia o resultado | `puedeLeerClinico` | Paciente: solo su `pacienteId`. Médica: solo pacientes de `asignaciones`. Administración y sistemas: no. |
| Escribir un diagnóstico | `puedeEscribirClinico` | Solo la médica, y solo sobre una paciente asignada. |
| Ver o reprogramar un turno | `puedeVerTurno`, `puedeReprogramarTurno` | Paciente: el suyo. Médica: si ella es la profesional. Administración: cualquiera. Sistemas: no. |
| Ver o pagar una factura | `puedeVerFactura` | Paciente: la suya. Administración: cualquiera. Médica y sistemas: no. |
| Exportar un paciente | `alcanceExportacion` | Paciente: lo propio. Médica: clínica de sus pacientes, sin facturas. Administración: facturas, sin clínica. Sistemas: nada. |
| Usuarios y auditoría | `puedeAdministrarUsuarios` | Solo si `rol === "sistemas"`. |
| Cambiar el perfil | `PUT /api/perfil`, en `server/index.js` | Solo el campo `nombre`. Si llega `rol`, `activo` u otro campo, responde 400 y no guarda nada. |
| Listar cuentas de prueba | `GET /api/internal/debug/users` | Responde 404. |

Si la validación no pasa, la ruta responde 403 y no incluye el recurso. La pantalla puede abrirse igual: el permiso lo decide el servidor.

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

El menú usa el rol de la sesión. Ocultar un enlace no es el control: `#/admin` se puede abrir escribiendo la ruta aunque no esté en el menú. En modo vulnerable la API responde 200. En modo seguro responde 403 y la pantalla muestra el rechazo: la vista se abrió, el dato no.

Los números de paciente, archivo, turno y factura están en el hash (`#/historias/3`, `#/resultados/3`, `#/reportes/3`) y en la solicitud (`GET /api/pacientes/3/historia`). La prueba es cambiar ese número en la barra de direcciones. Ocultar el enlace o no dibujar el botón sería usabilidad, no un control: por eso el modo vulnerable igual muestra el formulario de diagnóstico.

La sesión viaja en `Authorization: Bearer`, no en una cookie. El servidor usa el rol guardado en la cuenta.

## Qué queda a propósito fuera de este trabajo

Las listas filtradas, el hash de la clave y el bloqueo de `passwordHash` en el perfil evitan que el laboratorio se rompa o filtre la clave. No reemplazan la autorización por recurso. Quedan fuera de alcance otras fallas (inyección, CSRF sobre cookies, XSS) porque el práctico estudia control de acceso.

El modo es global al proceso de Node. Dos ventanas comparten Vulnerable o Seguro. **Restablecer datos** vuelve pacientes, turnos, facturas y roles al estado inicial, y no cierra la sesión.
