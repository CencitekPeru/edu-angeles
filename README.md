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
