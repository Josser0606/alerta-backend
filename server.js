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
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT, 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();


// ---- Configurar el "Transportador" de Email ----
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    }
});
// ---- FIN ----


// ---- Tareas Programadas (CRON JOBS) ----
cron.schedule('0 8 * * *', () => {
    console.log('--- CRON JOB (4 DÍAS): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosCuatroDias();
}, {
    timezone: "America/Bogota"
});

cron.schedule('1 8 * * *', () => {
    console.log('--- CRON JOB (HOY): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosHoy();
}, {
    timezone: "America/Bogota"
});
// ---- FIN ----


// ---- Funciones de Tareas Programadas ----
async function revisarCumpleanosCuatroDias() {
    try {
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

        if (resultados.length > 0) {
            console.log(`¡Encontrados ${resultados.length} cumpleaños (en 4 días)! Enviando email...`);
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.EMAIL_USER,   
                subject: '🔔 Alerta de Próximos Cumpleaños (en 4 días)',
                text: `¡Hola! \n\nEstas personas cumplen años en 4 días:\n\n${listaNombres}\n\nQue tengas un buen día.`
            };
            await transporter.sendMail(mailOptions);
            console.log('--- Email de alerta (4 días) enviado con éxito ---');
        } else {
            console.log('--- No se encontraron cumpleaños en 4 días. No se envía email. ---');
        }
    } catch (error) {
        console.error('Error en el cron job (4 días):', error);
    }
}

async function revisarCumpleanosHoy() {
    try {
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
// ---- FIN FUNCIONES CRON ----


// 5. RUTAS API
// -----------------------------------------------------------------

// Ruta para HOY (Existente)
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

// Ruta para PRÓXIMOS (Existente)
app.get('/api/cumpleaneros/proximos', async (req, res) => {
    console.log("¡Recibida petición para próximos cumpleaños!");
    try {
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

// ---- RUTA NUEVA PARA RESUMEN (NOTIFICACIONES) ----
app.get('/api/cumpleaneros/resumen', async (req, res) => {
    console.log("¡Recibida petición de RESUMEN!");
    try {
        // Query 1: Conteo de HOY
        const sqlHoy = `
            SELECT COUNT(*) as count 
            FROM cumpleaneros 
            WHERE 
                MONTH(fecha_nacimiento) = MONTH(CURDATE()) 
                AND 
                DAY(fecha_nacimiento) = DAY(CURDATE());
        `;

        // Query 2: Conteo de PRÓXIMOS 7 DÍAS
        const sqlProximos = `
            SELECT COUNT(*) as count FROM (
                WITH CumpleanosProximos AS (
                    SELECT 
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
                    CASE
                        WHEN cumple_este_ano < CURDATE()
                        THEN DATE_ADD(cumple_este_ano, INTERVAL 1 YEAR)
                        ELSE cumple_este_ano
                    END AS proxima_fecha
                FROM 
                    CumpleanosProximos
                HAVING 
                    proxima_fecha BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ) as SubQuery;
        `;
        
        const [resHoy, resProximos] = await Promise.all([
            dbPool.query(sqlHoy),
            dbPool.query(sqlProximos)
        ]);
        const countHoy = resHoy[0][0].count;
        const countProximos = resProximos[0][0].count;
        res.json({ hoy: countHoy, proximos: countProximos });

    } catch (error) {
        console.error("Error al consultar el resumen:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});
// ---- FIN RUTA RESUMEN ----


// ---- RUTA NUEVA PARA BÚSQUEDA ----
app.get('/api/cumpleaneros/buscar', async (req, res) => {
    console.log("¡Recibida petición de BÚSQUEDA!");
    try {
        const { nombre } = req.query;
        if (!nombre) {
            return res.json([]);
        }

        const searchTerm = `%${nombre}%`;
        const sqlQuery = `
            SELECT nombre_completo, fecha_nacimiento 
            FROM cumpleaneros 
            WHERE nombre_completo LIKE ? 
            ORDER BY nombre_completo ASC
            LIMIT 50;
        `;
        
        const [resultados] = await dbPool.query(sqlQuery, [searchTerm]);
        console.log(`Búsqueda de '${nombre}' devolvió ${resultados.length} resultados.`);
        res.json(resultados);

    } catch (error) {
        console.error("Error en la búsqueda:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});
// ---- FIN RUTA BÚSQUEDA ----


// ---- RUTAS DE PRUEBA (Opcional) ----
app.get('/api/test-email-hoy', async (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (HOY) INICIADA!!");
    await revisarCumpleanosHoy();
    res.json({ mensaje: "Prueba de email (HOY) ejecutada." });
});
app.get('/api/test-email-4dias', async (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (4 DÍAS) INICIADA!!");
    await revisarCumpleanosCuatroDias();
    res.json({ mensaje: "Prueba de email (4 DÍAS) ejecutada." });
});
// ---- FIN DE RUTAS DE PRUEBA ----


// 6. Iniciar el servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor API corriendo en puerto ${PORT}`);
    console.log('Tarea CRON (4 días) activada. Se ejecutará todos los días a las 8:00 AM.');
    console.log('Tarea CRON (HOY) activada. Se ejecutará todos los días a las 8:01 AM.');
});