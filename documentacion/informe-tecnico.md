# Informe técnico · Broken Access Control en MediPortal

**Materia:** Seguridad en el Desarrollo de Software · UTN, Ingeniería en Sistemas de Información
**Trabajo:** Trabajo Práctico Integrador (TPI) · opción 1: *desarrollar un sitio web con una vulnerabilidad y explicar sus soluciones*
**Tema aprobado en la propuesta:** Broken Access Control

Este informe acompaña al laboratorio. Para ejecutar las pruebas paso a paso, ver el [tutorial de explotación](tutorial-explotacion.md).

---

## 1. Resumen

El control de acceso decide **qué puede ver o hacer cada usuario** sobre cada recurso. Cuando falla, una persona autenticada accede a datos o acciones que no le corresponden. Es el puesto #1 del OWASP Top 10 por su frecuencia e impacto: filtración de datos sensibles, modificación de registros ajenos y escalada de privilegios.

MediPortal, un portal ficticio de una red de clínicas, implementa **dos políticas de autorización sobre el mismo código**, que se alternan con un interruptor:

- **Modo vulnerable:** la aplicación sabe *quién* inició sesión, pero no verifica *a qué tiene derecho*. Alcanza con conocer un número de recurso.
- **Modo seguro:** cada operación se autoriza **en el servidor**, por rol y por pertenencia del recurso.

Se demuestran **once fallas** en backend y frontend, cada una con su explotación, su impacto y su corrección. La conclusión central es que **el frontend no es una barrera de seguridad, sino una capa de usabilidad**: toda decisión de acceso debe tomarse en el servidor.

## 2. El sistema y su premisa

MediPortal permite a pacientes consultar turnos, resultados e historia clínica; a médicos registrar diagnósticos; al personal administrativo gestionar agenda y facturación; y al área de sistemas administrar usuarios y roles. Reemplaza historias en papel y resultados por correo sin cifrar, y aporta trazabilidad sobre quién accede a cada dato.

Su valor depende de una premisa: **que cada persona vea solo lo que le corresponde.** Por eso es un caso representativo para estudiar esta vulnerabilidad.

El permiso lo decide el rol de la cuenta con la que se entró. El menú (`ENLACES`, en `public/app.js`) muestra las pantallas de ese rol. La Guía del práctico está en el menú de los cuatro: es del laboratorio, no de la clínica.

**Administración** nombra dos cosas distintas. El rol Administración (`administrativo`, Carlos Ruiz) gestiona agenda y facturas. El ítem de menú Administración (`#/admin`) es la pantalla de usuarios y roles, y solo aparece para Sistemas.

La tabla es el modo seguro. En modo vulnerable, una sesión alcanza para leer o modificar un recurso si se conoce el número, aunque el menú no muestre la pantalla.

| Rol | Pantallas del menú | En modo seguro puede | Queda fuera |
|---|---|---|---|
| Paciente | Inicio, Historias clínicas, Resultados, Turnos, Facturación, Mi perfil | Ver su historia y sus resultados, ver y reprogramar sus turnos, ver y pagar sus facturas | Reportes del hospital, datos de otra persona, escribir diagnósticos, usuarios |
| Médica / médico | Las del paciente, más Reportes, sin Facturación | Ver y escribir la historia de sus pacientes asignados, ver sus resultados, ver y reprogramar los turnos de su agenda, exportar la clínica de esos pacientes | Facturas, pacientes que no tiene asignados, usuarios |
| Administración | Inicio, Turnos, Facturación, Reportes, Mi perfil | Ver y reprogramar cualquier turno, ver y pagar cualquier factura, exportar las facturas de cualquier paciente | Historias, resultados, diagnósticos, estudios, usuarios |
| Sistemas | Inicio, Mi perfil, Administración | Listar usuarios, cambiarles el rol y el estado, leer la auditoría | Historias, resultados, turnos, facturas, reportes |

El rol solo no alcanza: también importa de quién es el recurso.

- Ana es la paciente 1 y Lucas es la 2. Cada uno opera ese `pacienteId`.
- La Dra. Molina atiende a Ana y a María Soto. No atiende a Lucas. Sus pacientes están en `asignaciones`.
- El turno 101 y la factura 201 son de Ana. El turno 102 y la factura 202 son de Lucas, con el Dr. Herrera, que no tiene usuario del portal. El turno 103 y la factura 203 son de María.
- María Soto es la paciente 3. No tiene correo para entrar. Tiene historia, la ecografía (resultado 3), el turno 103 y la factura 203. Su historia es un control prenatal: es el recurso ajeno que pide la guía.

## 3. Arquitectura del laboratorio

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Políticas de autorización | [`server/autorizacion.js`](../server/autorizacion.js) | Una función por tipo de recurso. Cada una devuelve `true` en modo vulnerable y aplica la regla real en modo seguro |
| Rutas y API | [`server/index.js`](../server/index.js) | Express. Llama a esas funciones y registra cada decisión en la auditoría |
| Datos | [`server/datos.js`](../server/datos.js) | Datos ficticios en memoria, con **Restablecer datos** |
| Interfaz | [`public/app.js`](../public/app.js) | Portal de una sola página, con el interruptor de modo y la *Guía del práctico* |
| Verificación | [`scripts/verificar.mjs`](../scripts/verificar.mjs) | Recorre la API en ambos modos y falla si un control no responde como se espera |

Tecnologías. El práctico es una aplicación web de una sola carpeta. No usa framework de interfaz ni base de datos.

| Capa | Tecnología | Para qué |
|---|---|---|
| Entorno | Node.js 18 o superior, módulos ES | Ejecuta el servidor con `node server/index.js` |
| Servidor y API | Express 4 | Rutas REST, JSON y el portal estático |
| Claves | bcryptjs | Guarda la clave de demostración como hash. El endpoint de prueba no la devuelve |
| Interfaz | HTML, CSS y JavaScript | Páginas del portal, sin React ni otro framework |
| Datos | Memoria del proceso | Pacientes, historias, turnos y facturas se reinician con **Restablecer datos** |
| Sesión | Token aleatorio | Viaja en `Authorization: Bearer`, no en una cookie. El rol es el de la cuenta en el servidor |

**Cómo se lee el código vulnerable.** La falla está en una línea repetida: `if (esVulnerable(modo)) return true;` al inicio de cada política. El resto de la función es la **corrección**. Así, el antes y el después conviven en el mismo lugar y se pueden mostrar en vivo.

**El interruptor.** **Vulnerable / Seguro** guarda `lab.modo` en el servidor (`server/datos.js`). El botón manda `POST /api/lab/modo` con `{ "modo": "seguro" }` o `"vulnerable"`. La cuenta sigue igual, el menú sigue igual y lo ya escrito queda escrito. El modo es uno para todo el proceso: dos ventanas ven el mismo. Cada ruta de `server/index.js` llama a una función de `server/autorizacion.js` y le pasa ese modo. `/api/lab/modo` y `/api/lab/restablecer` existen para la demostración: no forman parte del portal que se evalúa. **Restablecer datos** vuelve pacientes, turnos, facturas y roles al estado inicial, y no cierra la sesión.

Las listas del inicio están filtradas en los dos modos. El portal se ve bien y el fallo queda en el acceso directo: la pantalla lista “lo mío”, pero `GET /api/pacientes/3/historia` no pregunta de quién es.

## 4. Catálogo de vulnerabilidades

Referencias de ubicación: archivo y líneas de la versión del repositorio. La columna *Propuesta* indica la viñeta de la sección 3 de la propuesta que cubre cada falla.

| # | Vulnerabilidad | Backend / Frontend | Propuesta |
|---|---|---|---|
| V1 | IDOR en historia clínica | Backend | Historias clínicas por número de paciente |
| V2 | IDOR en resultados de estudios | Backend | Resultados por número de archivo |
| V3 | IDOR en turnos | Backend | Turnos por identificador (reprogramación) |
| V4 | IDOR en facturas | Backend | Facturas por identificador (pago) |
| V5 | Gráfico del hospital y exportación sin validar el alcance | Backend | Exportaciones y reportes con filtros de paciente |
| V6 | Endpoint de prueba publicado | Backend | Endpoints internos o de prueba no retirados |
| V7 | Asignación masiva en el perfil | Backend | Mass assignment (rol, estado de cuenta) |
| V8 | Autorización por función ausente | Backend | Rutas administrativas que solo verifican autenticación |
| V9 | El menú sigue el rol de la sesión | Frontend | Cambiar el rol solo desde Administración |
| V10 | Ruta administrativa accesible por URL | Frontend | Rutas accesibles aunque no estén en el menú |
| V11 | Identificadores expuestos y modificables | Frontend | IDs en la URL y en las solicitudes de red |

---

### V1 · IDOR en historia clínica

**Qué es.** *Insecure Direct Object Reference*: la aplicación usa un identificador directo (el número de paciente) y no comprueba que quien lo pide tenga derecho sobre ese recurso. La autenticación es correcta; la **autorización por recurso no existe**.

**Dónde está.**
- Política: [`autorizacion.js:7-12`](../server/autorizacion.js#L7-L12) (`puedeLeerClinico`, línea vulnerable: 8) y [`autorizacion.js:14-17`](../server/autorizacion.js#L14-L17) (`puedeEscribirClinico`).
- Rutas: [`index.js:208-220`](../server/index.js#L208-L220) (`GET /api/pacientes/:id/historia`) y [`index.js:222-245`](../server/index.js#L222-L245) (`POST`, registrar diagnóstico).

**Explotación.** Ana (paciente 1) pide `/api/pacientes/3/historia` y recibe el control prenatal de María Soto, con su DNI. Con `POST` un paciente podría incluso **escribir** un diagnóstico en una historia ajena.

**Impacto.** Filtración de datos de salud y alteración de la historia clínica.

**Corrección** (modo seguro, [`autorizacion.js:9-10`](../server/autorizacion.js#L9-L10) y [`:16`](../server/autorizacion.js#L16)):
```js
if (usuario.rol === "paciente") return usuario.pacienteId === pacienteId;
if (usuario.rol === "medico")   return pacientesDelMedico(usuario.id).includes(pacienteId);
return false;                                   // administrativo y sistemas: sin acceso clínico
```
La autorización se decide **por recurso y por rol**; un rol que no está contemplado queda denegado por defecto. El servidor responde `403` sin incluir el contenido.

---

### V2 · IDOR en resultados de estudios

**Qué es.** Igual que V1, pero el identificador es el **número de archivo** del estudio.

**Dónde está.** [`autorizacion.js:7-12`](../server/autorizacion.js#L7-L12) (reutiliza `puedeLeerClinico` con el dueño del resultado) y [`index.js:251-262`](../server/index.js#L251-L262) (`GET /api/resultados/:id`).

**Explotación.** Ana pide `/api/resultados/3` y obtiene la ecografía obstétrica de María.

**Corrección.** La autorización se calcula con el `pacienteId` **dueño del archivo**, no con el número recibido: `puedeLeerClinico(req.usuario, resultado.pacienteId, lab.modo)` ([`index.js:255`](../server/index.js#L255)). Conocer el número de archivo deja de alcanzar.

---

### V3 · IDOR en turnos

**Dónde está.** [`autorizacion.js:19-33`](../server/autorizacion.js#L19-L33) (`puedeVerTurno`, `puedeReprogramarTurno`) y rutas [`index.js:268-276`](../server/index.js#L268-L276) (`GET`) y [`index.js:278-293`](../server/index.js#L278-L293) (`PATCH`).

**Explotación.** Ana lee el turno 102 de Lucas y además **cambia su fecha** (`PATCH`), con lo que se modifica el registro de otra persona.

**Impacto.** Fuga de información y manipulación de la agenda.

**Corrección** ([`autorizacion.js:21-24`](../server/autorizacion.js#L21-L24), [`:29-32`](../server/autorizacion.js#L29-L32)): el paciente solo opera sus turnos (`turno.pacienteId`), el médico los de su agenda (`turno.medicoId`), administración los gestiona y sistemas no accede.

---

### V4 · IDOR en facturas

**Dónde está.** [`autorizacion.js:35-40`](../server/autorizacion.js#L35-L40) (`puedeVerFactura`) y rutas [`index.js:299-307`](../server/index.js#L299-L307) (`GET`) y [`index.js:309-321`](../server/index.js#L309-L321) (`POST /:id/pagar`).

**Explotación.** Ana lee la factura 202 (resonancia de Lucas, $95.000) y **registra su pago**, lo que modifica un comprobante ajeno.

**Impacto.** Fuga de datos de cobro y alteración de comprobantes.

**Corrección.** Paciente solo sus facturas; administración, todas; médico y sistemas, ninguna ([`autorizacion.js:37-39`](../server/autorizacion.js#L37-L39)). La **misma** política protege la lectura y el pago.

---

### V5 · Gráfico del hospital y exportación sin validar el alcance

**Qué es.** `#/reportes` muestra un gráfico de barras del hospital y, si la URL trae un número (`#/reportes/3`), el informe de esa persona. El gráfico no lleva filtro: en modo vulnerable cuenta a todo el hospital. La exportación acepta `?pacienteId=` y, en ese mismo modo, confía en el número para devolver el informe completo.

**Dónde está.**
- Gráfico: [`autorizacion.js:42-47`](../server/autorizacion.js#L42-L47) (`alcanceResumen`) y [`index.js:348-353`](../server/index.js#L348-L353) (`GET /api/reportes/resumen`).
- Informe: [`autorizacion.js:49-55`](../server/autorizacion.js#L49-L55) (`alcanceExportacion`) y [`index.js:355-373`](../server/index.js#L355-L373) (`GET /api/reportes/export`).

Reportes no está en el menú del paciente. La ruta igual existe.

**Explotación.** En modo vulnerable el gráfico cuenta pacientes, casos críticos, en seguimiento, estudios, turnos y facturas pendientes de todo el hospital. `GET /api/reportes/export?pacienteId=3` devuelve alcance `completo`: diagnósticos, estudios y facturas de María, aunque quien pide sea Ana.

**Corrección.** En modo seguro las dos funciones recortan el alcance. Si no hay alcance, la ruta responde `403` y no incluye el recurso.

| Quién | Gráfico (`alcanceResumen`) | Informe (`alcanceExportacion`) |
|---|---|---|
| Paciente | No | No, ni el propio |
| Médica | Clínica de sus pacientes, sin facturas | Clínica de sus pacientes, sin facturas |
| Administración | Turnos y facturas, sin casos críticos | Solo facturación, sin DNI ni diagnósticos |
| Sistemas | No | No |

El filtro del cliente nunca define el alcance por sí solo.

---

### V6 · Endpoint de prueba publicado

**Qué es.** Una ruta de diagnóstico que debió retirarse antes de publicar.

**Dónde está.** [`index.js:375-396`](../server/index.js#L375-L396) (`GET /api/internal/debug/users`). Está registrada **sin** `exigirSesion` (compárese con [`index.js:55`](../server/index.js#L55)).

**Explotación.** Sin iniciar sesión, devuelve nombre, correo, rol y estado de todas las cuentas. Sirve para elegir objetivos de ataque.

**Corrección.** En modo seguro responde `404`, como si no existiera ([`index.js:376-378`](../server/index.js#L376-L378)). La solución real es **no publicarla** o restringirla a desarrollo. En el laboratorio no devuelve claves ni hashes, para no volver trivial el resto de las pruebas.

---

### V7 · Asignación masiva (*mass assignment*)

**Qué es.** El endpoint de actualización de perfil copia al usuario **todos** los campos del cuerpo, sin lista de campos permitidos.

**Dónde está.** [`index.js:150-201`](../server/index.js#L150-L201). El copiado vulnerable está en [`index.js:184-190`](../server/index.js#L184-L190); la lista blanca, en [`index.js:44`](../server/index.js#L44) (`CAMPOS_PERFIL`) y [`index.js:160-170`](../server/index.js#L160-L170).

**Explotación.** El formulario real solo envía `nombre`, pero el servidor acepta más. Con `{ "nombre": "Ana Paz", "rol": "sistemas", "activo": true }`, Ana se convierte en **sistemas**. También podría enviar `activo: false` para inutilizar una cuenta, o `pacienteId` para ver la clínica de otra persona.

**Corrección.** Lista blanca: solo `nombre`. Cualquier otro campo provoca `400 CAMPOS_NO_PERMITIDOS` **y no se escribe nada**. El rol solo se cambia en `PATCH /api/admin/usuarios/:id`, protegido por función (V8).

---

### V8 · Autorización por función ausente

**Qué es.** Rutas administrativas que solo verifican que haya sesión, sin comprobar el rol.

**Dónde está.** [`autorizacion.js:57-60`](../server/autorizacion.js#L57-L60) (`puedeAdministrarUsuarios`) y rutas [`index.js:398-403`](../server/index.js#L398-L403) (listar), [`:405-410`](../server/index.js#L405-L410) (auditoría) y [`:412-430`](../server/index.js#L412-L430) (cambiar rol/estado).

**Explotación.** Ana lista todas las cuentas con `/api/admin/usuarios`, aunque el menú no le muestre Administración. Con `PATCH` podría desactivar a otro usuario o darse un rol superior.

**Corrección.** `return usuario.rol === "sistemas";` ([`autorizacion.js:59`](../server/autorizacion.js#L59)). Se valida el rol **que conoce el servidor** en cada request. La sesión viaja en `Authorization: Bearer`, no en una cookie.

---

### V9 · El menú no cambia el rol

**Qué es.** El menú muestra las pantallas del rol de la sesión. Cambiar lo que se ve en el navegador no cambia el rol que usa el servidor.

**Dónde está.** El menú se filtra con `state.user.rol` en [`public/app.js`](../public/app.js). El rol de una cuenta se cambia en `PATCH /api/admin/usuarios/:id`, y en modo seguro solo si `puedeAdministrarUsuarios` acepta la sesión.

**Cómo se cambia.** **Mi perfil** no ofrece un rol para elegir. El formulario manda solo el nombre. El rol se agrega en la petición, desde las herramientas del navegador.

1. Entrá, abrí **Mi perfil** y presioná F12 → **Red**.
2. Presioná **Guardar nombre**. Aparece `PUT /api/perfil` con `{ "nombre": "Ana Paz" }`.
3. Editá y reenviá esa petición (en Firefox: clic derecho sobre `perfil` → **Editar y reenviar**). El cuerpo queda así:

```json
{ "nombre": "Ana Paz", "rol": "sistemas", "activo": true }
```

`rol` solo acepta `paciente`, `medico`, `administrativo` o `sistemas`. En modo vulnerable el servidor guarda `rol` y `activo`, y el menú pasa a ser el de ese rol. En modo seguro responde 400 y no guarda nada.

Para cambiar el rol de otra persona, entrá con Nora Vidal y abrí **Administración**. Cada fila se guarda con `PATCH /api/admin/usuarios/:id`. En modo seguro solo Sistemas puede hacerlo. En modo vulnerable esa pantalla responde a cualquier sesión que abra `#/admin`.

**Lección.** Ocultar un enlace es usabilidad. Quien escribe `#/admin` abre la pantalla igual, y la API decide si entrega los datos (V8 y V10).

---

### V10 · Ruta administrativa accesible por URL

**Qué es.** `#/admin` existe aunque no esté en el menú. Quien escribe la ruta abre la pantalla.

**Dónde está.** Enrutado por hash en [`app.js:135-139`](../public/app.js#L135-L139) y vista en [`app.js:499`](../public/app.js#L499) (`vistaAdmin`); la protección efectiva está en la API ([`index.js:398-403`](../server/index.js#L398-L403)).

**Explotación.** En modo vulnerable, abrir `#/admin` muestra el panel completo con todos los usuarios.

**Corrección.** En modo seguro la pantalla **se abre igual**, pero la API responde `403` y la vista muestra *"El servidor rechazó el acceso"* ([`app.js:220`](../public/app.js#L220)). La vista se abrió; **el dato no**. Ocultar el enlace o no dibujar el botón de diagnóstico sería usabilidad, no un control: por eso el modo vulnerable igual muestra el formulario.

---

### V11 · Identificadores expuestos y modificables

**Qué es.** Los números de paciente, archivo, turno y factura viajan en la URL (`#/historias/3`) y en la solicitud de red (`GET /api/pacientes/3/historia`). El usuario los puede observar y cambiar.

**Dónde está.** `parseRoute` en `public/app.js` lee el número del hash. Las vistas de historia, resultado, turno, factura y reporte arman la petición con ese número. No hay un campo para elegirlo: se cambia en la barra de direcciones.

**Explotación.** Es el vehículo de V1 a V5: cambiar el número en la URL (`#/historias/3`, `#/resultados/3`, `#/turnos/102`, `#/facturas/202`, `#/reportes/3`). `#/reportes`, sin número, pide el gráfico del hospital.

**Corrección.** Un ID visible no es un fallo **si el servidor autoriza** (V1 a V4). Usar identificadores no secuenciales (UUID) puede dificultar la enumeración, pero es defensa en profundidad y **nunca sustituye** la autorización.

---

## 5. Cobertura de la propuesta

| Punto de la propuesta (sección 3) | Cubierto por |
|---|---|
| IDOR · historias clínicas y resultados por número de paciente o archivo | V1, V2 |
| IDOR · turnos y facturas por identificador (reprogramación o pago) | V3, V4 |
| IDOR · exportaciones y reportes con filtros de paciente | V5 |
| IDOR · endpoints internos o de prueba no retirados | V6 |
| Asignación masiva (rol, estado de cuenta) | V7 |
| Rutas administrativas que solo verifican autenticación | V8 |
| Frontend · el menú muestra el rol de la sesión; el rol se cambia en Administración | V9 |
| Frontend · rutas administrativas accesibles por URL | V10 |
| Frontend · identificadores expuestos en URL y solicitudes de red | V11 |
| *"El frontend no es una barrera de seguridad, sino una capa de usabilidad"* | V8 + V9 + V10 (demostrado en el modo seguro) |
| Trazabilidad sobre quién accede a cada información | Auditoría ([`index.js:74-76`](../server/index.js#L74-L76), vista de Sistemas) |

## 6. Contramedidas transversales

1. **Autorizar siempre en el servidor, en cada request.** El navegador es del usuario.
2. **Denegar por defecto.** Cada política termina en `return false`: un rol no contemplado no accede.
3. **Centralizar.** Las reglas viven en [`autorizacion.js`](../server/autorizacion.js), una función por recurso, no dispersas en cada ruta.
4. **Autorizar por pertenencia del recurso**, no por el identificador recibido.
5. **Lista blanca de campos** en toda escritura (V7) y roles de escritura separados de los de perfil.
6. **Separación de funciones.** Administración no ve historias; sistemas no ve datos clínicos ni facturas; el médico solo ve a sus pacientes.
7. **Auditoría de decisiones**, permitidas y rechazadas, sin copiar el contenido clínico ([`index.js:74-76`](../server/index.js#L74-L76)). En modo seguro solo Sistemas la consulta.
8. **Retirar endpoints de prueba** antes de publicar (V6).
9. **No filtrar contenido en los rechazos:** el `403` no incluye datos del recurso.
10. **Probar la autorización:** [`scripts/verificar.mjs`](../scripts/verificar.mjs) comprueba que el usuario A recibe `403` al pedir recursos del usuario B.

## 7. Verificación

```bash
npm install
npm run verificar
```

El script recorre la API en los dos modos con cinco cuentas y falla si algún control no responde como está descripto. Resultado esperado:

```
Verificación completa: controles vulnerables y seguros responden como corresponde.
```

Las respuestas HTTP observadas para Ana Paz están resumidas en la [tabla del tutorial](tutorial-explotacion.md#resultados-esperados-en-resumen).

## 8. Alcance y limitaciones

- Los datos son ficticios y viven en memoria. **Restablecer datos** vuelve pacientes, turnos, facturas y roles al estado inicial, y no cierra la sesión. Pasar a modo seguro no deshace lo que el modo vulnerable ya escribió.
- El modo es global al proceso de Node. Dos ventanas comparten Vulnerable o Seguro.
- La clave de demostración es común a todas las cuentas y se guarda con hash (bcrypt). El bloqueo de `password` y `passwordHash` en el perfil evita que el laboratorio filtre la clave. El laboratorio estudia **control de acceso**; quedan fuera inyección, XSS, CSRF y otras fallas.
- Los filtros de las listas del inicio funcionan en ambos modos a propósito: el portal se ve bien y la falla queda en el **acceso directo por identificador**, que es la forma habitual de este tipo de vulnerabilidad.
- Es un laboratorio local, no un sistema para publicar.

## 9. Referencias

- OWASP Top 10: *A01 Broken Access Control*. <https://owasp.org/Top10/>
- OWASP API Security Top 10: *BOLA* (autorización a nivel de objeto), *BOPLA* (asignación masiva) y *BFLA* (autorización a nivel de función). <https://owasp.org/API-Security/>
- MITRE CWE: **CWE-639** (omisión de autorización mediante clave controlada por el usuario), **CWE-915** (modificación de atributos asignados dinámicamente), **CWE-285** (autorización incorrecta).
