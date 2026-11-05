# Colegio

## Desarrollo local

Requisitos: Node.js y MySQL (por ejemplo, MySQL desde XAMPP).

1. Inicia MySQL desde XAMPP.
2. Instala dependencias con `npm install`.
3. Ejecuta `npm run dev` para iniciar la aplicación web y la API.
4. Abre la dirección de Vite que aparece en la terminal.

La API crea la base de datos `nodo_sala` y las cuentas de demostración en el
primer inicio. Si MySQL usa otra configuración, crea un archivo `.env` tomando
como referencia `.env.example`.

### Despliegue en Railway

Railway debe ejecutar `npm run build` como comando de construcción y `npm start`
como comando de inicio. El servidor publica el frontend compilado y la API en
el mismo dominio. Configura `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_NAME` y `JWT_SECRET` en las variables del servicio Railway.
También se admiten las variables MySQL `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`,
`MYSQLPASSWORD`, `MYSQLDATABASE` o una URL `MYSQL_URL`/`DATABASE_URL`. La API
escucha en `0.0.0.0` usando el puerto asignado por Railway en `PORT`. En
producción, `JWT_SECRET` debe tener al menos 32 caracteres.

### Despliegue en EC2 (Ubuntu)

Desde la carpeta del proyecto, ejecuta `npm run build:ec2` para instalar las
dependencias exactas de `package-lock.json` (incluidas las de compilación) y
generar el frontend de producción. Después, inicia o reinicia el proceso de la
aplicación con el mecanismo que uses en EC2. Ejecuta este comando después de
actualizar el código; `npm run build` por sí solo no instala dependencias.

Genera una clave segura localmente con `node -p "require('node:crypto').randomBytes(48).toString('base64url')"`
y copia el resultado directamente en **Variables** del servicio de la API en
Railway con el nombre `JWT_SECRET` (sin añadir comillas). Guarda los cambios y
vuelve a desplegar. No pongas el valor en el código ni lo compartas en chats.

Las variables de Railway solo están disponibles dentro del servicio desplegado.
Para usar la base remota desde una ejecución local, configura las mismas
variables en un archivo `.env` local y no lo subas al repositorio.

Desde el panel de administración, la sección **Materiales** permite llevar las
existencias de mobiliario escolar y otros recursos, con categoría, ubicación,
estado y observaciones. La sección **Equipos** sigue dedicada a los equipos
tecnológicos con su historial de mantenimiento e incidencias.

### Cuentas de demostración

- Coordinación: `admin@colegio.edu` / DNI `12345678`
- Docente: `maria.lopez@colegio.edu` / DNI `23456789`

Para iniciar solo la aplicación web o solo la API, usa `npm run dev:web` o
`npm run server`, respectivamente. La API escucha en `http://127.0.0.1:3001`.

El ingreso se realiza con correo institucional y DNI de 8 dígitos. Los usuarios
con cuentas antiguas sin DNI pueden ingresar una vez con su contraseña previa y
registrar el documento desde **Mi perfil**.

La foto del panel de inicio de sesión proviene de
[Unsplash](https://images.unsplash.com/photo-1562774053-701939374585).
