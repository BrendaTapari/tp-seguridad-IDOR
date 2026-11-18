# Tutorial · cómo explotar las vulnerabilidades (y ver la corrección)

Este tutorial usa la **Guía del práctico** que ya trae la aplicación: cada prueba es un botón que ejecuta la petición contra la API y muestra la respuesta del servidor. No hace falta ninguna herramienta adicional.

Para el fundamento de cada falla, su ubicación en el código y su solución, ver el [informe técnico](informe-tecnico.md).

---

## 1. Preparación

Requiere Node.js 18 o superior.

```bash
npm install
npm start
```

Abrir <http://localhost:3000>. Si el puerto está ocupado: `PORT=3100 npm start`.

**Cuentas** (la clave de todas es `portal`):

| Persona | Rol | Correo |
|---|---|---|
| **Ana Paz** | Paciente (n.º 1) | `ana.paz@mediportal.test` |
| Lucas Díaz | Paciente (n.º 2) | `lucas.diaz@mediportal.test` |
| Dra. Elena Molina | Médica de Ana y de María | `dra.molina@mediportal.test` |
| Carlos Ruiz | Administración | `carlos.ruiz@mediportal.test` |
| Nora Vidal | Sistemas | `nora.vidal@mediportal.test` |

**Datos que se usan en las pruebas:**
María Soto es la paciente n.º 3 (sin usuario). Es ajena a Ana y a Lucas.
Turno **102** y factura **202** son de **Lucas**. Resultado (archivo) **3** es la ecografía de **María**.

**Controles de la pantalla** (barra superior, visibles en todo momento):

| Botón | Qué hace |
|---|---|
| **Vulnerable** | El servidor solo mira que haya sesión |
| **Seguro** | El servidor autoriza cada recurso por rol y pertenencia |
| **Restablecer datos** | Devuelve pacientes, turnos, facturas y roles al estado inicial |

> Todas las pruebas se hacen **como Ana Paz**. Es una paciente común: nada de lo que sigue debería estar a su alcance.

## 2. Cómo se hace una prueba

1. Entrar con `ana.paz@mediportal.test` / `portal`.
2. En el menú lateral, abrir **Guía del práctico**.
3. Presionar el botón de cada tarjeta. Aparece la petición (método, ruta, código HTTP) y la respuesta del servidor.
4. Repetir lo mismo en **modo seguro** y comparar.

## 3. Parte A · modo vulnerable

Activar **Vulnerable**. Hacer las pruebas **en este orden**: las últimas modifican datos y el rol de Ana, y podrían confundir las anteriores.

| # | Tarjeta de la guía | Botón | Qué demuestra | Resultado esperado |
|---|---|---|---|---|
| 1 | IDOR en la historia clínica | **Pedir historia 3** | Ana lee la historia de otra paciente (V1) | `200`. Se ve a **María Soto** con su DNI y el control prenatal |
| 2 | IDOR en un resultado | **Pedir resultado 3** | Conocer el n.º de archivo alcanza (V2) | `200`. Ecografía obstétrica de María |
| 3 | IDOR en turnos | **Ver turno 102** | Lee el turno de Lucas (V3) | `200`. Turno de Lucas con el Dr. Herrera |
| 4 | IDOR en facturas | **Ver factura 202** | Lee una factura ajena (V4) | `200`. Resonancia lumbar de Lucas, $95.000 |
| 5 | Exportación sin alcance | **Exportar paciente 3** | El filtro del cliente decide de quién son los datos (V5) | `200`, alcance `completo`: historia, estudios y facturas de María |
| 6 | Endpoint de prueba | **Llamar sin sesión** | Una ruta olvidada responde sin autenticarse (V6) | `200`. Lista de cuentas, con aviso *"Endpoint de diagnóstico expuesto"* |
| 7 | Autorización por función | **Listar usuarios** | La API admin no mira el rol (V8) | `200`. Lista completa de usuarios |
| 8 | Autorización por función | **Abrir #/admin** | La pantalla oculta del menú se abre por URL (V10) | Se abre el panel con todos los usuarios y la auditoría |
| 9 | El rol en el navegador | **Mostrar menú de sistemas** | El menú se decide con un dato editable (V9) | Aparece **Administración** en el menú; el servidor sigue viendo a Ana como paciente |
| 10 | IDOR en turnos | **Reprogramar turno 102** ⚠ | Modifica un registro ajeno (V3) | `200`. Estado `reprogramado`, nueva fecha |
| 11 | IDOR en facturas | **Pagar factura 202** ⚠ | Altera un comprobante ajeno (V4) | `200`. Estado `pagada` |
| 12 | Asignación masiva | **Enviar rol sistemas** ⚠ | El perfil acepta campos de más (V7) | `200`, `aplicados: ["nombre","rol","activo"]`. **Ana pasa a ser Sistemas** |

⚠ **Modifican datos.** Después de la prueba 9 presionar **Usar el rol del servidor en el menú** (banda de aviso) para volver el menú a la normalidad. Después de las pruebas 10 a 12, presionar **Restablecer datos** antes de pasar al modo seguro. La prueba 12 deja a Ana como Sistemas hasta que se restablece.

> **Por qué este orden:** si se hace la prueba 12 antes de la 7 o la 8, Ana ya sería Sistemas y la API de administración respondería `200` de forma legítima, lo que invalida la demostración.

## 4. Parte B · modo seguro

1. Presionar **Restablecer datos**.
2. Activar **Seguro**. Los resultados de la guía se limpian.
3. **Sin cambiar de cuenta**, repetir los 12 botones en el mismo orden.

El servidor ahora rechaza cada operación:

| # | Botón | Resultado esperado |
|---|---|---|
| 1 | Pedir historia 3 | `403` *"No tiene permiso para ver esta historia clínica."* |
| 2 | Pedir resultado 3 | `403` *"No tiene permiso para ver este resultado."* |
| 3 | Ver turno 102 | `403` *"No tiene permiso para ver este turno."* |
| 4 | Ver factura 202 | `403` *"No tiene permiso para ver esta factura."* |
| 5 | Exportar paciente 3 | `403` *"No tiene permiso para exportar los datos de este paciente."* |
| 6 | Llamar sin sesión | `404` *"No encontrado."* (el endpoint "se retiró") |
| 7 | Listar usuarios | `403` *"No tiene permiso para administrar usuarios."* |
| 8 | Abrir #/admin | La pantalla se abre pero muestra **"El servidor rechazó el acceso"** (`403`) |
| 9 | Mostrar menú de sistemas | El menú muestra Administración, pero al abrirla responde `403` |
| 10 | Reprogramar turno 102 | `403` *"No tiene permiso para reprogramar este turno."* |
| 11 | Pagar factura 202 | `403` *"No tiene permiso para registrar el pago de esta factura."* |
| 12 | Enviar rol sistemas | `400` `CAMPOS_NO_PERMITIDOS`, `campos: ["rol","activo"]`. **No se escribe nada** |

Es decir: el mismo botón, la misma petición, pero ahora el control existe **en el servidor**.

## 5. Resultados esperados en resumen

Códigos HTTP observados con Ana Paz:

| Prueba | Vulnerable | Seguro |
|---|---|---|
| Historia de otra paciente (`GET /api/pacientes/3/historia`) | `200` | `403` |
| Resultado ajeno (`GET /api/resultados/3`) | `200` | `403` |
| Turno ajeno: ver / reprogramar (`GET`, `PATCH /api/turnos/102`) | `200` / `200` | `403` / `403` |
| Factura ajena: ver / pagar (`GET /api/facturas/202`, `POST …/pagar`) | `200` / `200` | `403` / `403` |
| Exportación (`GET /api/reportes/export?pacienteId=3`) | `200` (completo) | `403` |
| Endpoint de prueba sin sesión (`GET /api/internal/debug/users`) | `200` | `404` |
| API de administración (`GET /api/admin/usuarios`) | `200` | `403` |
| Perfil con `rol` y `activo` (`PUT /api/perfil`) | `200` (rol cambiado) | `400` |

## 6. Variantes manuales (opcional)

Los botones ejecutan las mismas peticiones que se pueden hacer a mano. Sirven para mostrar que **el atacante controla el cliente**.

- **Cambiar el identificador en la URL (V11).** En la barra de direcciones, reemplazar el número: `#/historias/3`, `#/resultados/3`, `#/turnos/102`, `#/facturas/202` o `#/reportes/3`.
- **Ver la petición real.** Abrir las DevTools (**F12**) → **Network**, y repetir cualquier prueba: aparece `GET /api/pacientes/3/historia` con el identificador a la vista.
- **Cambiar el rol del navegador (V9).** En la barra lateral, el selector **Rol guardado en el navegador** modifica `localStorage.mediportal_rol`. También se puede ver en **Application** (Chrome) o **Storage** (Firefox) → **Local Storage**.
- **Probar con otro rol.** Entrar como la Dra. Molina, Carlos o Nora para ver la **separación de funciones**: la médica no ve facturas, administración no ve historias y sistemas no ve datos clínicos.

> Con otro rol, algunos accesos del modo seguro son **legítimos**: la Dra. Molina atiende a María, y administración ve todos los turnos y facturas. La guía está narrada con Ana Paz para que el rechazo sea claro.

## 7. Guion sugerido para la exposición (≈10 minutos)

1. **(1 min)** Qué es MediPortal y su premisa: *cada persona ve solo lo que le corresponde*.
2. **(4 min)** Modo vulnerable como Ana: pruebas 1, 2, 5, 6, 7, 9 y 12. Mostrar la respuesta con datos de María y cómo un perfil común se convierte en Sistemas.
3. **(3 min)** **Restablecer datos**, pasar a **Seguro** y repetir las mismas pruebas: todo `403`/`404`/`400`.
4. **(1 min)** Mostrar en [`server/autorizacion.js`](../server/autorizacion.js) la línea `if (esVulnerable(modo)) return true;` y la regla que sigue: ahí está la diferencia.
5. **(1 min)** Conclusión: el frontend es usabilidad; la autorización se decide en el servidor, por recurso y por función.

## 8. Si algo no sale como se espera

| Síntoma | Causa y solución |
|---|---|
| Los botones del modo seguro responden `200` | Se está entrando con un rol al que le corresponde el acceso. Repetir con **Ana Paz** |
| Listar usuarios da `200` en modo seguro | Ana quedó como Sistemas por la prueba 12. Presionar **Restablecer datos** |
| El menú muestra Administración y el servidor lo rechaza | Es lo esperado en la prueba 9. Usar **Usar el rol del servidor en el menú** para volver |
| Un resultado de la guía quedó de la prueba anterior | Cambiar de modo limpia la guía. También sirve volver a presionar el botón |
| `EADDRINUSE` al iniciar | El puerto 3000 está ocupado: `PORT=3100 npm start` |
| Querer comprobar todo de una vez | `npm run verificar` recorre la API en ambos modos y falla ante cualquier desvío |
