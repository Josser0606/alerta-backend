// 1. Importar las librerías
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

// ---- Importar las herramientas para email y cron ----
require('dotenv').config(); // Carga las variables del .env
const nodemailer = require('nodemailer');
const cron = require('node-cron');
// ---- FIN ----

// 2. Crear la aplicación de Express
const app = express();

// 3. Usar los "middlewares"
app.use(cors());
app.use(express.json()); 

// 4. Configurar la conexión a la Base de Datos
// El servidor de Render nos da las variables
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT, // ¡Asegúrate de añadir el puerto!
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();


// ---- Configurar el "Transportador" de Email ----
// Esto le dice a Nodemailer cómo conectarse a tu Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail', // Usamos Gmail
    auth: {
        user: process.env.EMAIL_USER, // Tu correo (del .env)
        pass: process.env.EMAIL_PASS  // Tu "Contraseña de Aplicación" (del .env)
    }
});
// ---- FIN ----


// ---- Tareas Programadas (CRON JOBS) ----

// TAREA 1 (Existente): Aviso de 4 días antes
cron.schedule('0 8 * * *', () => {
    console.log('--- CRON JOB (4 DÍAS): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosCuatroDias();
}, {
    timezone: "America/Bogota" // ¡Ajusta tu zona horaria!
});

// ---- NUEVO: TAREA 2 (HOY) ----
// Se ejecuta a las 8:01 AM (un minuto después de la otra)
cron.schedule('1 8 * * *', () => {
    console.log('--- CRON JOB (HOY): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosHoy();
}, {
    timezone: "America/Bogota"
});
// ---- FIN NUEVO ----


// Función para la Tarea 1 (4 días)
async function revisarCumpleanosCuatroDias() {
    try {
        // 1. Consulta SQL para buscar cumpleaños en EXACTAMENTE 4 días
        const sqlQuery = `
            SELECT nombre_completo 
            FROM cumpleaneros 
            WHERE 
                fecha_nacimiento IS NOT NULL
                AND
                MONTH(fecha_nacimiento) = MONTH(DATE_ADD(CURDATE(), INTERVAL 4 DAY))
                AND 
                DAY(fecha_nacimiento) = DAY(DATE_ADD(CURDATE(), INTERVAL 4 DAY));
        `;

        const [resultados] = await dbPool.query(sqlQuery);

        // 2. Si encontramos resultados, enviamos el email
        if (resultados.length > 0) {
            console.log(`¡Encontrados ${resultados.length} cumpleaños (en 4 días)! Enviando email...`);
            
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            
            // 3. Opciones del Email
            const mailOptions = {
                from: process.env.EMAIL_USER, // Quién envía
                to: process.env.EMAIL_USER,   // A quién se le envía (a ti mismo)
                subject: '🔔 Alerta de Próximos Cumpleaños (en 4 días)',
                text: `¡Hola! \n\nEstas personas cumplen años en 4 días:\n\n${listaNombres}\n\nQue tengas un buen día.`
            };

            // 4. Enviar el Email
            await transporter.sendMail(mailOptions);
            console.log('--- Email de alerta (4 días) enviado con éxito ---');

        } else {
            console.log('--- No se encontraron cumpleaños en 4 días. No se envía email. ---');
        }

    } catch (error) {
        console.error('Error en el cron job (4 días):', error);
    }
}

// ---- NUEVO: Función para la Tarea 2 (HOY) ----
async function revisarCumpleanosHoy() {
    try {
        // 1. Consulta SQL para buscar cumpleaños de HOY
        const sqlQuery = `
            SELECT nombre_completo 
            FROM cumpleaneros 
            WHERE 
                fecha_nacimiento IS NOT NULL
                AND
                MONTH(fecha_nacimiento) = MONTH(CURDATE())
                AND 
                DAY(fecha_nacimiento) = DAY(CURDATE());
        `;
        const [resultados] = await dbPool.query(sqlQuery);

        // 2. Si encontramos resultados, enviamos el email
        if (resultados.length > 0) {
            console.log(`¡Encontrados ${resultados.length} cumpleaños (HOY)! Enviando email...`);
            
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,   
                subject: '🎂 ¡Feliz Cumpleaños! (Alertas Fundación)',
                text: `¡Hola! \n\nEstas personas cumplen años HOY:\n\n${listaNombres}\n\n¡No olvides felicitarlas!`
            };

            await transporter.sendMail(mailOptions);
            console.log('--- Email de alerta (HOY) enviado con éxito ---');

        } else {
            console.log('--- No se encontraron cumpleaños (HOY). No se envía email. ---');
        }
    } catch (error) {
        console.error('Error en el cron job (HOY):', error);
    }
}
// ---- FIN NUEVO ----


// 5. TUS RUTAS API (EXISTENTES) - (Para que React siga funcionando)
// -----------------------------------------------------------------

// Ruta para cumpleaños de HOY
app.get('/api/cumpleaneros/hoy', async (req, res) => {
    
    console.log("¡Recibida petición para cumpleaños de hoy!");

    try {
        const sqlQuery = `
            SELECT nombre_completo, fecha_nacimiento 
            FROM cumpleaneros 
            WHERE 
                MONTH(fecha_nacimiento) = MONTH(CURDATE()) 
                AND 
                DAY(fecha_nacimiento) = DAY(CURDATE());
        `;
        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);
    } catch (error) {
        console.error("Error al consultar la base de datos:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// Ruta para TODOS los cumpleaños
app.get('/api/cumpleaneros/todos', async (req, res) => {
    try {
        const [resultados] = await dbPool.query("SELECT * FROM cumpleaneros");
        res.json(resultados);
    } catch (error) {
        console.error("Error al consultar todos:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// Ruta para los PRÓXIMOS 7 DÍAS
app.get('/api/cumpleaneros/proximos', async (req, res) => {
    
    console.log("¡Recibida petición para próximos cumpleaños!");

    try {
        // Consulta corregida (Sin MAKE_DATE)
        const sqlQuery = `
            WITH CumpleanosProximos AS (
                SELECT 
                    nombre_completo, 
                    fecha_nacimiento,
                    DATE_ADD(
                        DATE_SUB(CURDATE(), INTERVAL DAYOFYEAR(CURDATE()) - 1 DAY), 
                        INTERVAL DAYOFYEAR(fecha_nacimiento) - 1 DAY
                    ) AS cumple_este_ano
                FROM 
                    cumpleaneros
                WHERE 
                    fecha_nacimiento IS NOT NULL
            )
            SELECT 
                nombre_completo, 
                fecha_nacimiento,
                CASE
                    WHEN cumple_este_ano < CURDATE()
                    THEN DATE_ADD(cumple_este_ano, INTERVAL 1 YEAR)
                    ELSE cumple_este_ano
                END AS proxima_fecha
            FROM 
                CumpleanosProximos
            HAVING 
                proxima_fecha BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ORDER BY
                proxima_fecha ASC;
        `;

        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);

    } catch (error) {
        console.error("Error al consultar próximos cumpleaños:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// ---- RUTAS DE PRUEBA TEMPORALES ----

// Botón de prueba para la alerta de HOY
app.get('/api/test-email-hoy', async (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (HOY) INICIADA!!");
    await revisarCumpleanosHoy();
    res.json({ mensaje: "Prueba de email (HOY) ejecutada. Revisa los logs de Render y tu correo." });
});

// Botón de prueba para la alerta de 4 DÍAS
app.get('/api/test-email-4dias', async (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (4 DÍAS) INICIADA!!");
    await revisarCumpleanosCuatroDias();
    res.json({ mensaje: "Prueba de email (4 DÍAS) ejecutada. Revisa los logs de Render y tu correo." });
});

// ---- FIN DE RUTAS DE PRUEBA ----

// 6. Iniciar el servidor
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Servidor API corriendo en http://localhost:${PORT}`);
    // Mensaje de que los cron están activos
    console.log('Tarea CRON (4 días) activada. Se ejecutará todos los días a las 8:00 AM.');
    // ---- NUEVO MENSAJE ----
    console.log('Tarea CRON (HOY) activada. Se ejecutará todos los días a las 8:01 AM.');
});

