# Visitas

Aplicación con Vue 3, TypeScript, Vue Router y Pinia para el frontend, Bun y TypeScript para la API, y MySQL 8.4 como base de datos.

## Requisitos

- [Bun](https://bun.sh/) 1.2 o posterior
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) con Docker Compose

## Inicio rápido

1. Instala las dependencias desde la raíz:

   ```powershell
   bun install
   ```

2. Crea el archivo de configuración del backend:

   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```

3. Inicia MySQL:

   ```powershell
   docker compose up -d db
   ```

4. Ejecuta la migración de las tablas del sistema:

   ```powershell
   bun run db:migrate
   ```

   Crea los catálogos, directorios de visitantes y empresas, personal externo,
   citas, equipo, bitácora, historial de cambios de citas y permisos por sección,
   además de atribuir las citas existentes a su creador cuando la cuenta puede identificarse sin ambigüedad. La cuenta de MySQL configurada en `backend\.env` debe
   tener permiso para crear tablas. Si ya tienes MySQL instalado, ajusta allí
   `DB_NAME=visitas_recep`, `DB_USER` y `DB_PASSWORD` antes de ejecutar la migración.
   Para enviar pases QR por correo, configura también `SMTP_HOST`, `SMTP_PORT`,
   `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` en `backend\.env`.
   La recuperación de contraseña usa el mismo servicio SMTP y requiere
   `PUBLIC_APP_URL` con la URL pública del frontend en producción. En desarrollo
   local, si se deja vacío, se utiliza `http://localhost:5173`.
   Para Microsoft 365 normalmente se usa `smtp.office365.com`, puerto `587` y
   STARTTLS (`SMTP_SECURE=false`); el área de TI debe confirmar los datos y
   habilitar SMTP AUTH en la cuenta. POP solo sirve para recibir correo y no
   sustituye SMTP para enviar.

5. En una terminal, inicia la API:

   ```powershell
   bun run dev:backend
   ```

6. En otra terminal, inicia el frontend:

   ```powershell
   bun run dev:frontend
   ```

Para insertar usuarios de prueba en `accesos`, configura una contraseña temporal
local (mínimo 12 caracteres) en PowerShell y ejecuta el seed:

```powershell
$env:SEED_TEST_PASSWORD = Read-Host "Contraseña para las cuentas de prueba"
bun run db:seed:test-users
Remove-Item Env:SEED_TEST_PASSWORD
```

El seed es repetible e inicializa los usuarios de prueba o sustituye el marcador
anterior, sin restablecer contraseñas que ya tengan un hash. Incluye perfiles de
Administrador, Recepción y Programador (`jehg13072002@gmail.com`). El usuario
Programador tiene `priv_admin = 'Y'` y entra al dashboard completo. Las
contraseñas se guardan como hashes Argon2id. El login acepta usuario o correo y
solo permite cuentas activas. Las tres cuentas usan la contraseña ingresada
para ejecutar el seed; no se guarda en el repositorio ni queda en el entorno
después de ejecutar `Remove-Item`.

El seed registra también el permiso `recepcion` en `accesos_secciones` para la
cuenta de prueba de Recepción.

Al iniciar sesión como administrador, la sección Accesos muestra los usuarios de
`accesos` sin exponer contraseñas ni datos de activación. La tabla exacta no
tiene columna de departamento, por eso aparece como sin vincular; el `role` se
muestra como puesto. En Accesos se asigna un único perfil de aplicación:
Administrador, Recepción o Sin acceso. Estas asignaciones se guardan en
`accesos_secciones` y no modifican ningún campo de la tabla externa `accesos`,
incluidos `active` y `priv_admin`. Los privilegios existentes de
`priv_admin = 'Y'` permanecen administradores y no se pueden retirar desde esta
interfaz. El acceso a Anfitriones se conserva como permiso aparte y se concede
al registrar una cuenta existente como anfitrión; no se configura desde Accesos.
El login siempre respeta el estado `active` de la cuenta externa.

El Programador conserva acceso completo. Recepción solo tiene las vistas
Agenda de citas y Bitácora diaria; en la Agenda puede consultar todas las citas y
ver sus QR, pero no crearlas, cancelarlas, eliminarlas ni enviarlas. El rol
Anfitrión tiene acceso a Agenda y a todos los módulos de Externos: contratistas,
proveedores, visitantes, personal externo y equipo/herramientas. Sus citas se
filtran por login y puede crear, cancelar, eliminar y enviar el pase únicamente
de sus propias citas. Las citas canceladas y las modificaciones se conservan en
el historial del Inicio; eliminar una cita requiere cancelarla y la oculta de la
agenda sin borrar su historial ni los movimientos asociados. Los cambios de Externos se protegen también en la API y
requieren el permiso `anfitriones`; asignar el permiso de Recepción mantiene
ese rol en modo de solo lectura para la Agenda.

La navegación del frontend solo controla qué secciones se muestran; cada API
valida la sesión y el permiso requerido por separado. La ruta heredada
`/api/visits` también requiere acceso de Recepción o Administrador, por lo que
no expone registros a visitantes sin autenticar.

La sección Departamentos lee y guarda sus registros en MySQL (`departments`);
crear, editar y eliminar requiere una cuenta administradora. Al eliminar un
departamento con anfitriones vinculados, la interfaz impide la acción. El
dashboard recuerda la sección seleccionada por cuenta al recargar. Los perfiles
de anfitriones de demostración se conservan en el almacenamiento local de ese
navegador para mantener sus vínculos y contadores entre recargas; todavía no
son registros compartidos entre navegadores ni están guardados en MySQL.
El formulario de anfitriones permite seleccionar una cuenta de `accesos` y
completa su login, nombre, correo, puesto y teléfono; el departamento se elige
por separado. Al registrar una cuenta existente como anfitrión, se guarda
también su permiso `anfitriones` en `accesos_secciones`. La opción `Otro`
habilita la captura manual y no crea permisos porque ese login no proviene de
una cuenta autenticable de `accesos`. La tabla de anfitriones muestra únicamente
esos datos y el departamento; los perfiles de anfitrión siguen guardándose en
el navegador.

Contratistas/proveedores y público general se consultan y guardan en MySQL
(`business_partners` y `general_visitors`). La sección ofrece registro, edición,
eliminación, búsqueda y filtros, y mantiene los datos al recargar o abrir la
aplicación en otro navegador. El RFC de empresa y la CURP (cuando se captura)
no pueden duplicarse.

El inicio de sesión se conserva al recargar mediante una cookie HttpOnly de
duración de ocho horas, también después de reiniciar el backend, mientras la
cuenta permanezca activa y no cambie su contraseña.

La recuperación de contraseña se abre como ventana emergente desde el login.
Envía un enlace de un solo uso que vence en 10 minutos; las solicitudes se
limitan a una por correo cada 2 minutos, con un máximo de 3 por hora y 10 por
origen por hora. La respuesta no revela si el correo pertenece a una cuenta.
Las contraseñas nuevas deben tener entre 12 y 128 caracteres y se guardan con
Argon2id. Para proteger el inicio de sesión, tras 3 contraseñas incorrectas se
aplica una espera de 5 minutos; cada 2 fallos adicionales aumenta 5 minutos,
hasta un máximo de 60 minutos. El bloqueo se aplica por cuenta y dirección de
origen y se limpia al iniciar sesión correctamente o restablecer la contraseña.

Abre <http://localhost:5173>. Vite reenvía las solicitudes `/api` a `http://localhost:3000`.
La API ofrece `GET /api/health` para comprobar la conexión y `GET /api/visits` para consultar las visitas.
Vue Router permite navegar directamente a las secciones del dashboard, por ejemplo `/agenda` o
`/bitacora`; Vite entrega la aplicación también al recargar esas rutas.

## Despliegue con Docker en VPS

La imagen de producción separa el frontend estático en Nginx y la API en Bun.
La API se conecta a la base MySQL que ya está instalada y administrada en el
VPS; este Compose no crea otro servidor MySQL ni publica la base de datos. Solo
Nginx publica un puerto al host.

1. Copia `.env.production.example` como `.env.production` y configura
   `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD` con los datos que
   te entregue la persona responsable del VPS, además del dominio HTTPS en
   `PUBLIC_APP_URL`. Usa un usuario MySQL propio para la aplicación, no `root`,
   y no subas `.env.production` al repositorio. Si MySQL está instalado
   directamente en el mismo VPS, `DB_HOST=host.docker.internal` usa la puerta
   de enlace del host configurada por Docker; si está en otro servidor, usa su
   nombre DNS o IP privada.
2. Desde la raíz del proyecto, construye y levanta los servicios:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```

3. Comprueba el estado:

   ```sh
   docker compose --env-file .env.production -f docker-compose.prod.yml ps
   docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api web
   ```

   El servidor MySQL debe permitir conexiones desde la red Docker del VPS y el
   usuario de la aplicación necesita permisos sobre la base para crear y
   actualizar tablas e índices durante las migraciones. Si MySQL solo escucha
   en `127.0.0.1`, la persona que administra el VPS debe habilitar de forma
   segura la conexión desde Docker y limitarla con firewall; no expongas el
   puerto 3306 a Internet.

   Configura TLS con el proxy inverso del VPS (por ejemplo, Caddy, Traefik o
   Nginx del host) y reenvía el dominio al puerto indicado por `HTTP_PORT`
   (8080 por defecto). La API activa cookies `Secure` en producción, por lo que
   el acceso público debe servirse por HTTPS. Restringe en el firewall el puerto
   publicado a ese proxy si este se ejecuta en el host.

Para publicar una actualización, haz primero un respaldo de la base MySQL
existente y ejecuta la migración con la nueva imagen; después reconstruye y
levanta los servicios:

```sh
docker compose --env-file .env.production -f docker-compose.prod.yml run --build --rm migrate
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

En una instalación nueva, `up` ejecuta la migración antes de iniciar la API.
Las migraciones crean las tablas de la aplicación si faltan y pueden actualizar
el esquema existente; no ejecutan el seed de usuarios de prueba. Verifica los
respaldos antes de cualquier cambio de esquema y no ejecutes el seed en
producción.

## Producción: rendimiento y origen

- El logo principal del login se entrega como WebP (~31 KB en lugar de ~908 KB) y se precarga
  con prioridad alta para reducir el Largest Contentful Paint (LCP).
- Publica el frontend y la API bajo el mismo origen HTTPS. Configura el proxy del hosting para
  enviar `/api/*` al servidor Bun y para devolver `index.html` en las rutas de Vue Router.
  Vite solo configura el proxy `/api` durante desarrollo; no sustituye este proxy en producción.
- Al mantener frontend y API en el mismo origen, CORS no se necesita. No habilites
  `Access-Control-Allow-Origin: *` para esta API; no hay una allowlist CORS configurada.
- Ejecuta Bun con `NODE_ENV=production` para que las cookies de sesión incluyan `Secure`, y
  configura `PUBLIC_APP_URL` con la URL HTTPS pública del frontend para los enlaces enviados
  por correo.

## Comandos

| Comando | Descripción |
| --- | --- |
| `bun run dev:frontend` | Inicia Vue con recarga en caliente |
| `bun run dev:backend` | Inicia la API con reinicio al cambiar archivos |
| `bun run db:migrate` | Crea las tablas y actualiza el esquema de aplicación, incluida la propiedad de las citas |
| `bun run db:seed:test-users` | Inserta usuarios de prueba en `accesos` sin duplicarlos |
| `bun run typecheck` | Comprueba los tipos de frontend y backend |
| `bun run build` | Genera el build del frontend y comprueba el backend |
| `docker compose up -d db` | Inicia MySQL en segundo plano |
| `docker compose down` | Detiene MySQL conservando sus datos |

## Estructura

```text
frontend/              Aplicación Vue 3 + Vite + TypeScript + Vue Router + Pinia
  src/App.vue          Punto de entrada de las vistas del router
  src/AppShell.vue     Restaura la sesión y decide qué vista mostrar
  src/router.ts        Rutas de la aplicación
  src/dashboardRoutes.ts Mapa entre secciones del dashboard y sus rutas
  src/LoginView.vue    Formulario de acceso
  src/DashboardView.vue Estructura del dashboard, navegación y estado compartido
  src/sections/        Home, Agenda, Anfitriones, Accesos, Departamentos,
                       Personal externo, Directorio, Equipo y Bitácora
backend/               API Bun + TypeScript
  src/db.ts            Pool de conexiones MySQL
  src/index.ts         Endpoints HTTP
database/init/         Esquema inicial de MySQL
backend/src/migrate.ts Ejecuta la migración idempotente de la aplicación
docker-compose.yml     Servicio local de base de datos
```

## Tablas creadas

- `departments`: catálogo de departamentos. El puesto se representa con el campo `role` de `accesos` y se asigna a un departamento desde el formulario del anfitrión.
- `business_partners`: contratistas y proveedores, con RFC, categoría, empleados y estado.
- `general_visitors`: público general, con CURP opcional.
- `external_staff`: datos básicos del personal vinculado a una empresa de `business_partners`; el formulario selecciona la empresa del catálogo y guarda el vínculo en MySQL.
- `appointments`: agenda persistente; conserva empresa, anfitrión, correo del visitante y login del creador para filtrar las citas de cada anfitrión. Los pases QR se adjuntan y envían por el SMTP configurado.
- `equipment_records`: tabla anterior de equipo que se conserva; el flujo nuevo usa tablas propias de declaraciones y revisiones.
- `daily_log_entries`: bitácora diaria. Se guarda en MySQL, permite consultar rangos de hasta un año, buscar y filtrar movimientos, y relacionarlos opcionalmente con citas, personal externo o visitantes. Los ingresos y retiros vinculados actualizan el estado de la cita; el indicador de personas dentro considera el último ingreso/retiro de todo el historial, no solo la fecha visible.
- `equipment_declarations` y `equipment_declaration_items`: declaración de un solo uso, asociada con una empresa y, cuando existe, con su cita, visitante o registro de personal externo. Cada fila conserva si el artículo es equipo o herramienta.
- `equipment_inspections` y `equipment_inspection_items`: verificaciones separadas de Entrada y Salida, con el inspector, tipo de artículo, cantidades/características revisadas, resultados y observaciones de incidencias.
- `accesos`: estructura local de usuarios compatible con la tabla externa; conserva exactamente sus 13 columnas y nulabilidad, sin agregar campos.
- `accesos_secciones`: roles/permisos independientes por usuario (`administrador`, `recepcion`, `anfitriones`); no altera `accesos`. Desde la sección Accesos solo se administran Administrador o Recepción; Anfitriones se concede desde su propio flujo.
- `password_reset_tokens`, `auth_login_failures` y `auth_recovery_limits`: enlaces de recuperación de un solo uso, bloqueos progresivos de inicio de sesión y límites anti-spam. Los tokens se almacenan como hash.
- `visits`: tabla original de la aplicación, se conserva.

El módulo Equipo y herramientas crea enlaces públicos de declaración con vencimiento
a 30 días. El formulario público permite agregar varios artículos en una lista,
indicando si cada uno es equipo o herramienta. Antes de enviar, la persona confirma
que revisó la lista completa; al enviarla, los artículos se guardan y el enlace queda
revocado de inmediato. Programación puede renovar o revocar enlaces aún pendientes. La
verificación de Salida solo está disponible después de completar Entrada. Las
diferencias de cantidad o características, así como las incidencias indicadas por el
inspector, requieren observaciones. Este flujo no genera ni modifica movimientos de
la Bitácora y tampoco cambia el estado de una cita.

En la Bitácora diaria, Recepción puede escanear en el campo de acceso rápido el
QR enviado al visitante (con un lector que escriba el contenido como teclado) o
buscar su nombre y presionar Enter. El sistema registra entrada o salida según
el estado actual de la cita; también deja disponibles los botones para confirmar
el movimiento manualmente.

La migración es repetible, crea las tablas que faltan y actualiza columnas e índices
de compatibilidad; no carga
registros de demostración ni crea una tabla separada de puestos o anfitriones.
Si ejecutaste una versión anterior, la tabla `positions` que ya exista se
conserva sin utilizarse ni eliminarse.

Para MySQL instalado localmente, la base de datos se llama `visitas_recep`.
Si debes crearla manualmente, puedes ejecutar como administrador:

```sql
CREATE DATABASE IF NOT EXISTS visitas_recep
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'visitas_app'@'localhost'
  IDENTIFIED BY 'REEMPLAZA_CON_UNA_CONTRASEÑA_LOCAL';

GRANT ALL PRIVILEGES ON visitas_recep.* TO 'visitas_app'@'localhost';
```

Configura la misma contraseña en `backend\.env` y deja `DB_NAME=visitas_recep`.

Las credenciales de Compose son solo para desarrollo local. Cámbialas antes de usar este proyecto en un entorno compartido o de producción.
