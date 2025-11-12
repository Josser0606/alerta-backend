// 1. Importar las librerías
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

// ---- Herramientas de Email y Cron ----
require('dotenv').config(); 
const cron = require('node-cron');
// ---- FIN ----

// ---- NUEVO: Herramientas de Autenticación ----
const bcrypt = require('bcryptjs'); // Para encriptar contraseñas
const jwt = require('jsonwebtoken'); // Para los tokens de sesión
// ---- FIN ----


// 2. Crear la aplicación de Express
const app = express();

// 3. Usar los "middlewares"
app.use(cors());
app.use(express.json()); // Permite a Express leer JSON del body

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


// ---- Tareas Programadas (CRON JOBS) ----
// (Sin cambios, pero ahora usan la tabla 'voluntarios')
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


// ---- FUNCIÓN GENÉRICA PARA ENVIAR EMAIL (con Brevo) ----
// (Sin cambios)
async function enviarEmail(subject, textContent) {
    console.log("Enviando email vía Brevo...");
    const url = 'https://api.brevo.com/v3/smtp/email';
    const apiKey = process.env.EMAIL_PASS;
    const emailRemitente = process.env.EMAIL_USER;

    if (!apiKey || !emailRemitente) {
        console.error("Error: EMAIL_PASS o EMAIL_USER no están definidas.");
        return false;
    }

    const body = {
        sender: { email: emailRemitente },
        to: [{ email: emailRemitente }],
        subject: subject,
        textContent: textContent
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error de Brevo: ${response.status} ${JSON.stringify(errorData)}`);
        }
        const data = await response.json();
        console.log(`--- Email enviado con éxito a ${emailRemitente} ---`, data);
        return true;
    } catch (error) {
        console.error('Error al enviar email con Brevo:', error);
        return false;
    }
}


// ---- Funciones de Tareas Programadas (CORREGIDAS) ----
// (Ahora leen de la tabla 'voluntarios')
async function revisarCumpleanosCuatroDias() {
    try {
        const sqlQuery = `
            SELECT nombre_completo FROM voluntarios 
            WHERE fecha_nacimiento IS NOT NULL
            AND MONTH(fecha_nacimiento) = MONTH(DATE_ADD(CURDATE(), INTERVAL 4 DAY))
            AND DAY(fecha_nacimiento) = DAY(DATE_ADD(CURDATE(), INTERVAL 4 DAY));
        `;
        const [resultados] = await dbPool.query(sqlQuery);

        if (resultados.length > 0) {
            // ... (resto de la función sin cambios) ...
            console.log(`¡Encontrados ${resultados.length} cumpleaños (en 4 días)!`);
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            const subject = '🔔 Alerta de Próximos Cumpleaños (en 4 días)';
            const textContent = `¡Hola! \n\nEstas personas cumplen años en 4 días:\n\n${listaNombres}\n\nQue tengas un buen día.`;
            await enviarEmail(subject, textContent);
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
            SELECT nombre_completo FROM voluntarios 
            WHERE fecha_nacimiento IS NOT NULL
            AND MONTH(fecha_nacimiento) = MONTH(CURDATE())
            AND DAY(fecha_nacimiento) = DAY(CURDATE());
        `;
        const [resultados] = await dbPool.query(sqlQuery);

        if (resultados.length > 0) {
            // ... (resto de la función sin cambios) ...
            console.log(`¡Encontrados ${resultados.length} cumpleaños (HOY)!`);
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            const subject = '🎂 ¡Feliz Cumpleaños! (Alertas Fundación)';
            const textContent = `¡Hola! \n\nEstas personas cumplen años HOY:\n\n${listaNombres}\n\n¡No olvides felicitarlas!`;
            await enviarEmail(subject, textContent);
        } else {
            console.log('--- No se encontraron cumpleaños (HOY). No se envía email. ---');
        }
    } catch (error) {
        console.error('Error en el cron job (HOY):', error);
    }
}
// ---- FIN FUNCIONES CRON ----


// 5. RUTAS API (Endpoints)
// -----------------------------------------------------------------

// ---- NUEVO: RUTAS DE AUTENTICACIÓN (LOGIN) ----

// Ruta para REGISTRAR un nuevo usuario
// (La usaremos para crear nuestro primer admin)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, nombre_completo, rol } = req.body;

        // Validar inputs
        if (!email || !password || !rol) {
            return res.status(400).json({ mensaje: "Email, contraseña y rol son requeridos." });
        }

        // 1. Hashear la contraseña
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 2. Guardar en la base de datos
        const sqlQuery = `
            INSERT INTO usuarios (email, password_hash, nombre_completo, rol) 
            VALUES (?, ?, ?, ?)
        `;
        await dbPool.query(sqlQuery, [email, password_hash, nombre_completo, rol]);

        res.status(201).json({ mensaje: `Usuario ${email} registrado con éxito.` });
        console.log(`Usuario ${email} registrado con éxito.`);

    } catch (error) {
        console.error("Error al registrar usuario:", error);
        // Manejar error de email duplicado
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ mensaje: "Este email ya está registrado." });
        }
        res.status(500).json({ mensaje: "Error en el servidor al registrar." });
    }
});

// Ruta para INICIAR SESIÓN (Login)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Buscar al usuario por email
        const sqlQuery = "SELECT * FROM usuarios WHERE email = ?";
        const [usuarios] = await dbPool.query(sqlQuery, [email]);

        const usuario = usuarios[0];
        if (!usuario) {
            return res.status(400).json({ mensaje: "Credenciales incorrectas (email)." });
        }

        // 2. Comparar la contraseña
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(400).json({ mensaje: "Credenciales incorrectas (contraseña)." });
        }

        // 3. Crear el Token (JWT)
        const payload = {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol
        };
        const token = jwt.sign(
            payload, 
            process.env.JWT_SECRET, // Usa la clave secreta de Render
            { expiresIn: '1d' } // El token expira en 1 día
        );

        // 4. Enviar el token al frontend
        res.json({
            mensaje: "Login exitoso",
            token: token,
            usuario: {
                nombre: usuario.nombre_completo,
                rol: usuario.rol
            }
        });
        console.log(`Login exitoso para ${usuario.email}`);

    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ mensaje: "Error en el servidor al iniciar sesión." });
    }
});
// ---- FIN RUTAS AUTENTICACIÓN ----


// ---- RUTAS DE ALERTAS (CORREGIDAS con 'voluntarios') ----
// (El prefijo cambió de '/api/cumpleaneros' a '/api/voluntarios')

// Ruta para cumpleaños de HOY (Voluntarios)
app.get('/api/voluntarios/hoy', async (req, res) => {
    console.log("¡Recibida petición para cumpleaños de voluntarios de hoy!");
    try {
        const sqlQuery = `
            SELECT nombre_completo, fecha_nacimiento 
            FROM voluntarios 
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

// Ruta para los PRÓXIMOS 7 DÍAS (Voluntarios)
app.get('/api/voluntarios/proximos', async (req, res) => {
    console.log("¡Recibida petición para próximos cumpleaños de voluntarios!");
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
                    voluntarios
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

// Ruta para RESUMEN (Voluntarios)
app.get('/api/voluntarios/resumen', async (req, res) => {
    console.log("¡Recibida petición de RESUMEN de voluntarios!");
    try {
        const sqlHoy = `
            SELECT COUNT(*) as count 
            FROM voluntarios 
            WHERE 
                MONTH(fecha_nacimiento) = MONTH(CURDATE()) 
                AND 
                DAY(fecha_nacimiento) = DAY(CURDATE());
        `;
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
                        voluntarios
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

// Ruta para BÚSQUEDA (Voluntarios)
app.get('/api/voluntarios/buscar', async (req, res) => {
    try {
        const { nombre } = req.query;
        if (!nombre) {
            return res.json([]);
        }
        const searchTerm = `%${nombre}%`;
        const sqlQuery = `
            SELECT nombre_completo, fecha_nacimiento 
            FROM voluntarios 
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
// ---- FIN RUTAS ALERTAS ----


// ---- RUTAS DE PRUEBA (Sin cambios) ----
app.get('/api/test-email-hoy', (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (HOY) INICIADA!!");
    res.json({ mensaje: "Prueba de email (HOY) iniciada. Revisa los logs." });
    revisarCumpleanosHoy(); 
});
app.get('/api/test-email-4dias', (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (4 DÍAS) INICIADA!!");
    res.json({ mensaje: "Prueba de email (4 DÍAS) iniciada. Revisa los logs." });
    revisarCumpleanosCuatroDias();
});
// ---- FIN DE RUTAS DE PRUEBA ----


// 6. Iniciar el servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor API corriendo en puerto ${PORT}`);
    console.log('Tarea CRON (4 días) activada. Se ejecutará todos los días a las 8:00 AM.');
    console.log('Tarea CRON (HOY) activada. Se ejecutará todos los días a las 8:01 AM.');
});