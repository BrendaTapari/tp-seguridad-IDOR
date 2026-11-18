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

| Rol | Qué debería poder hacer |
|---|---|
| Paciente | Ver y operar **solo lo propio**: turnos, resultados, historia, facturas |
| Médico | Ver y registrar clínica **solo de sus pacientes asignados** y su agenda |
| Administrativo | Agenda y facturación. **No** ve historia clínica |
| Sistemas | Usuarios y roles. **No** ve datos clínicos ni facturas |

## 3. Arquitectura del laboratorio

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Políticas de autorización | [`server/autorizacion.js`](../server/autorizacion.js) | Una función por tipo de recurso. Cada una devuelve `true` en modo vulnerable y aplica la regla real en modo seguro |
| Rutas y API | [`server/index.js`](../server/index.js) | Express. Llama a esas funciones y registra cada decisión en la auditoría |
| Datos | [`server/datos.js`](../server/datos.js) | Datos ficticios en memoria, con **Restablecer datos** |
| Interfaz | [`public/app.js`](../public/app.js) | Portal de una sola página, con el interruptor de modo y la *Guía del práctico* |
| Verificación | [`scripts/verificar.mjs`](../scripts/verificar.mjs) | Recorre la API en ambos modos y falla si un control no responde como se espera |

**Cómo se lee el código vulnerable.** La falla está en una línea repetida: `if (esVulnerable(modo)) return true;` al inicio de cada política. El resto de la función es la **corrección**. Así, el antes y el después conviven en el mismo lugar y se pueden mostrar en vivo.

## 4. Catálogo de vulnerabilidades

Referencias de ubicación: archivo y líneas de la versión del repositorio. La columna *Propuesta* indica la viñeta de la sección 3 de la propuesta que cubre cada falla.

| # | Vulnerabilidad | Backend / Frontend | Propuesta |
|---|---|---|---|
| V1 | IDOR en historia clínica | Backend | Historias clínicas por número de paciente |
| V2 | IDOR en resultados de estudios | Backend | Resultados por número de archivo |
| V3 | IDOR en turnos | Backend | Turnos por identificador (reprogramación) |
| V4 | IDOR en facturas | Backend | Facturas por identificador (pago) |
| V5 | Exportación sin validar el alcance | Backend | Exportaciones y reportes con filtros de paciente |
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
- Rutas: [`index.js:204-216`](../server/index.js#L204-L216) (`GET /api/pacientes/:id/historia`) y [`index.js:218-241`](../server/index.js#L218-L241) (`POST`, registrar diagnóstico).

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

**Dónde está.** [`autorizacion.js:7-12`](../server/autorizacion.js#L7-L12) (reutiliza `puedeLeerClinico` con el dueño del resultado) y [`index.js:247-258`](../server/index.js#L247-L258) (`GET /api/resultados/:id`).

**Explotación.** Ana pide `/api/resultados/3` y obtiene la ecografía obstétrica de María.

**Corrección.** La autorización se calcula con el `pacienteId` **dueño del archivo**, no con el número recibido: `puedeLeerClinico(req.usuario, resultado.pacienteId, lab.modo)` ([`index.js:251`](../server/index.js#L251)). Conocer el número de archivo deja de alcanzar.

---

### V3 · IDOR en turnos

**Dónde está.** [`autorizacion.js:19-33`](../server/autorizacion.js#L19-L33) (`puedeVerTurno`, `puedeReprogramarTurno`) y rutas [`index.js:264-272`](../server/index.js#L264-L272) (`GET`) y [`index.js:274-289`](../server/index.js#L274-L289) (`PATCH`).

**Explotación.** Ana lee el turno 102 de Lucas y además **cambia su fecha** (`PATCH`), con lo que se modifica el registro de otra persona.

**Impacto.** Fuga de información y manipulación de la agenda.

**Corrección** ([`autorizacion.js:21-24`](../server/autorizacion.js#L21-L24), [`:29-32`](../server/autorizacion.js#L29-L32)): el paciente solo opera sus turnos (`turno.pacienteId`), el médico los de su agenda (`turno.medicoId`), administración los gestiona y sistemas no accede.

---

### V4 · IDOR en facturas

**Dónde está.** [`autorizacion.js:35-40`](../server/autorizacion.js#L35-L40) (`puedeVerFactura`) y rutas [`index.js:295-303`](../server/index.js#L295-L303) (`GET`) y [`index.js:305-317`](../server/index.js#L305-L317) (`POST /:id/pagar`).

**Explotación.** Ana lee la factura 202 (resonancia de Lucas, $95.000) y **registra su pago**, lo que modifica un comprobante ajeno.

**Impacto.** Fuga de datos de cobro y alteración de comprobantes.

**Corrección.** Paciente solo sus facturas; administración, todas; médico y sistemas, ninguna ([`autorizacion.js:37-39`](../server/autorizacion.js#L37-L39)). La **misma** política protege la lectura y el pago.

---

### V5 · Exportación sin validar el alcance

**Qué es.** El reporte acepta un filtro de paciente (`?pacienteId=`) y confía en él para decidir *de quién* son los datos.

**Dónde está.** [`autorizacion.js:42-48`](../server/autorizacion.js#L42-L48) (`alcanceExportacion`) y [`index.js:319-337`](../server/index.js#L319-L337).

**Explotación.** `GET /api/reportes/export?pacienteId=3` devuelve alcance `completo` (diagnósticos, estudios y facturas de María).

**Corrección.** La función devuelve un **alcance recortado según el rol**: paciente, solo lo propio; médico, solo clínica de sus pacientes; administración, solo facturación (sin DNI ni diagnósticos); sistemas, nada. Si no hay alcance, `403`. El filtro del cliente nunca define el alcance por sí solo.

---

### V6 · Endpoint de prueba publicado

**Qué es.** Una ruta de diagnóstico que debió retirarse antes de publicar.

**Dónde está.** [`index.js:339-360`](../server/index.js#L339-L360) (`GET /api/internal/debug/users`). Está registrada **sin** `exigirSesion` (compárese con [`index.js:55`](../server/index.js#L55)).

**Explotación.** Sin iniciar sesión, devuelve nombre, correo, rol y estado de todas las cuentas. Sirve para elegir objetivos de ataque.

**Corrección.** En modo seguro responde `404`, como si no existiera ([`index.js:340-342`](../server/index.js#L340-L342)). La solución real es **no publicarla** o restringirla a desarrollo. En el laboratorio no devuelve claves ni hashes, para no volver trivial el resto de las pruebas.

---

### V7 · Asignación masiva (*mass assignment*)

**Qué es.** El endpoint de actualización de perfil copia al usuario **todos** los campos del cuerpo, sin lista de campos permitidos.

**Dónde está.** [`index.js:146-197`](../server/index.js#L146-L197). El copiado vulnerable está en [`index.js:180-186`](../server/index.js#L180-L186); la lista blanca, en [`index.js:42`](../server/index.js#L42) (`CAMPOS_PERFIL`) y [`index.js:156-166`](../server/index.js#L156-L166).

**Explotación.** El formulario real solo envía `nombre`, pero el servidor acepta más. Con `{ "nombre": "Ana Paz", "rol": "sistemas", "activo": true }`, Ana se convierte en **sistemas**. También podría enviar `activo: false` para inutilizar una cuenta, o `pacienteId` para ver la clínica de otra persona.

**Corrección.** Lista blanca: solo `nombre`. Cualquier otro campo provoca `400 CAMPOS_NO_PERMITIDOS` **y no se escribe nada**. El rol solo se cambia en `PATCH /api/admin/usuarios/:id`, protegido por función (V8).

---

### V8 · Autorización por función ausente

**Qué es.** Rutas administrativas que solo verifican que haya sesión, sin comprobar el rol.

**Dónde está.** [`autorizacion.js:50-53`](../server/autorizacion.js#L50-L53) (`puedeAdministrarUsuarios`) y rutas [`index.js:362-367`](../server/index.js#L362-L367) (listar), [`:369-374`](../server/index.js#L369-L374) (auditoría) y [`:376-394`](../server/index.js#L376-L394) (cambiar rol/estado).

**Explotación.** Ana lista todas las cuentas con `/api/admin/usuarios`, aunque el menú no le muestre Administración. Con `PATCH` podría desactivar a otro usuario o darse un rol superior.

**Corrección.** `return usuario.rol === "sistemas";` ([`autorizacion.js:52`](../server/autorizacion.js#L52)). Se valida el rol **que conoce el servidor** en cada request.

---

### V9 · El menú no cambia el rol

**Qué es.** El menú muestra las pantallas del rol de la sesión. Cambiar lo que se ve en el navegador no cambia el rol que usa el servidor.

**Dónde está.** El menú se filtra con `state.user.rol` en [`public/app.js`](../public/app.js). El rol de una cuenta se cambia en `PATCH /api/admin/usuarios/:id`, y en modo seguro solo si `puedeAdministrarUsuarios` acepta la sesión.

**Cómo se cambia.** El formulario de **Mi perfil** envía solo el nombre. El rol se agrega editando `PUT /api/perfil` en la pestaña Red del navegador. En modo vulnerable el servidor lo guarda. En modo seguro ese campo se rechaza. El rol de otra cuenta se cambia en **Administración**.

**Lección.** Ocultar un enlace es usabilidad. Quien escribe `#/admin` abre la pantalla igual, y la API decide si entrega los datos (V8 y V10).

---

### V10 · Ruta administrativa accesible por URL

**Qué es.** `#/admin` existe aunque no esté en el menú. Quien escribe la ruta abre la pantalla.

**Dónde está.** Enrutado por hash en [`app.js:131-135`](../public/app.js#L131-L135) y vista en [`app.js:509`](../public/app.js#L509) (`vistaAdmin`); la protección efectiva está en la API ([`index.js:362-367`](../server/index.js#L362-L367)).

**Explotación.** En modo vulnerable, abrir `#/admin` muestra el panel completo con todos los usuarios.

**Corrección.** En modo seguro la pantalla **se abre igual**, pero la API responde `403` y la vista muestra *"El servidor rechazó el acceso"* ([`app.js:234`](../public/app.js#L234)). La vista se abrió; **el dato no**.

---

### V11 · Identificadores expuestos y modificables

**Qué es.** Los números de paciente, archivo, turno y factura viajan en la URL (`#/historias/3`) y en la solicitud de red (`GET /api/pacientes/3/historia`). El usuario los puede observar y cambiar.

**Dónde está.** `parseRoute` en `public/app.js` lee el número del hash. Las vistas de historia, resultado, turno, factura y reporte arman la petición con ese número. No hay un campo para elegirlo: se cambia en la barra de direcciones.

**Explotación.** Es el vehículo de V1 a V4: cambiar el número en la URL (`#/historias/3`, `#/resultados/3`, `#/turnos/102`, `#/facturas/202`, `#/reportes/3`).

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
| Trazabilidad sobre quién accede a cada información | Auditoría ([`index.js:72-74`](../server/index.js#L72-L74), vista de Sistemas) |

## 6. Contramedidas transversales

1. **Autorizar siempre en el servidor, en cada request.** El navegador es del usuario.
2. **Denegar por defecto.** Cada política termina en `return false`: un rol no contemplado no accede.
3. **Centralizar.** Las reglas viven en [`autorizacion.js`](../server/autorizacion.js), una función por recurso, no dispersas en cada ruta.
4. **Autorizar por pertenencia del recurso**, no por el identificador recibido.
5. **Lista blanca de campos** en toda escritura (V7) y roles de escritura separados de los de perfil.
6. **Separación de funciones.** Administración no ve historias; sistemas no ve datos clínicos ni facturas; el médico solo ve a sus pacientes.
7. **Auditoría de decisiones**, permitidas y rechazadas, sin copiar el contenido clínico ([`index.js:72-74`](../server/index.js#L72-L74)). En modo seguro solo Sistemas la consulta.
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

- Los datos son ficticios y viven en memoria; **Restablecer datos** los reinicia. El modo (vulnerable/seguro) es global al proceso.
- La clave de demostración es común a todas las cuentas y se guarda con hash (bcrypt). El laboratorio estudia **control de acceso**; quedan fuera inyección, XSS, CSRF y otras fallas.
- Los filtros de las listas del inicio funcionan en ambos modos a propósito: el portal "se ve bien" y la falla queda en el **acceso directo por identificador**, que es la forma habitual de este tipo de vulnerabilidad.
- Es un laboratorio local, no un sistema para publicar.

## 9. Referencias

- OWASP Top 10: *A01 Broken Access Control*. <https://owasp.org/Top10/>
- OWASP API Security Top 10: *BOLA* (autorización a nivel de objeto), *BOPLA* (asignación masiva) y *BFLA* (autorización a nivel de función). <https://owasp.org/API-Security/>
- MITRE CWE: **CWE-639** (omisión de autorización mediante clave controlada por el usuario), **CWE-915** (modificación de atributos asignados dinámicamente), **CWE-285** (autorización incorrecta).
