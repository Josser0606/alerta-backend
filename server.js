// 1. Importar las librerías
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

// ---- Importar las herramientas para email y cron ----
require('dotenv').config(); // Carga las variables del .env
const cron = require('node-cron');
// ---- FIN ----

// ---- Herramientas de Autenticación ----
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// ---- FIN ----


// 2. Crear la aplicación de Express
const app = express();

// 3. Usar los "middlewares"
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));


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


// ---- FUNCIÓN GENÉRICA PARA ENVIAR EMAIL (con Brevo) ----
async function enviarEmail(subject, textContent) {
    console.log("Enviando email vía Brevo...");

    const url = 'https://api.brevo.com/v3/smtp/email';
    
    // Usamos las variables de entorno
    const apiKey = process.env.EMAIL_PASS; // Clave de Brevo
    const emailRemitente = process.env.EMAIL_USER; // Correo verificado en Brevo

    // Verificamos que las variables estén cargadas
    if (!apiKey || !emailRemitente) {
        console.error("Error: EMAIL_PASS o EMAIL_USER no están definidas en las variables de entorno.");
        return false;
    }

    const body = {
        sender: { 
            email: emailRemitente 
        },
        to: [{ 
            email: emailRemitente   // Se envía al mismo correo del remitente
        }],
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


// ---- Funciones de Tareas Programadas (CRON JOBS) ----
// NOTA: Se añade el parámetro 'campoNombre' para manejar la diferencia entre tablas.

// TAREA 1: Voluntarios (4 días) -> Usa 'nombre_completo'
cron.schedule('0 8 * * *', () => {
    console.log('--- CRON JOB (Voluntarios 4 DÍAS): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosCuatroDias('voluntarios', 'fecha_nacimiento', '🔔 Alerta: Próximos Cumpleaños de Voluntarios (en 4 días)', 'nombre_completo');
}, { timezone: "America/Bogota" });

// TAREA 2: Voluntarios (HOY) -> Usa 'nombre_completo'
cron.schedule('1 8 * * *', () => {
    console.log('--- CRON JOB (Voluntarios HOY): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosHoy('voluntarios', 'fecha_nacimiento', '🎂 ¡Feliz Cumpleaños Voluntario! (Alertas Fundación)', 'nombre_completo');
}, { timezone: "America/Bogota" });

// TAREA 3: Benefactores (4 días) -> CORREGIDO: Usa 'nombre_benefactor'
cron.schedule('2 8 * * *', () => {
    console.log('--- CRON JOB (Benefactores 4 DÍAS): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosCuatroDias('benefactores', 'fecha_fundacion_o_cumpleanos', '🔔 Alerta: Próximos Cumpleaños de Benefactores (en 4 días)', 'nombre_benefactor');
}, { timezone: "America/Bogota" });

// TAREA 4: Benefactores (HOY) -> CORREGIDO: Usa 'nombre_benefactor'
cron.schedule('3 8 * * *', () => {
    console.log('--- CRON JOB (Benefactores HOY): Ejecutando revisión de cumpleaños ---');
    revisarCumpleanosHoy('benefactores', 'fecha_fundacion_o_cumpleanos', '🎂 ¡Feliz Cumpleaños Benefactor! (Alertas Fundación)', 'nombre_benefactor');
}, { timezone: "America/Bogota" });

// ---- Funciones Genéricas de CRON ----

async function revisarCumpleanosCuatroDias(tabla, campoFecha, emailSubject, campoNombre = 'nombre_completo') {
    try {
        // Usamos un ALIAS (AS nombre_completo) para unificar el resultado
        const sqlQuery = `
            SELECT ${mysql.escapeId(campoNombre)} AS nombre_completo
            FROM ${mysql.escapeId(tabla)} 
            WHERE 
                ${mysql.escapeId(campoFecha)} IS NOT NULL
                AND
                MONTH(${mysql.escapeId(campoFecha)}) = MONTH(DATE_ADD(CURDATE(), INTERVAL 4 DAY))
                AND 
                DAY(${mysql.escapeId(campoFecha)}) = DAY(DATE_ADD(CURDATE(), INTERVAL 4 DAY));
        `;
        const [resultados] = await dbPool.query(sqlQuery);

        if (resultados.length > 0) {
            console.log(`¡Encontrados ${resultados.length} cumpleaños de ${tabla} (en 4 días)! Enviando email...`);
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            const textContent = `¡Hola! \n\nEstas personas de ${tabla} cumplen años en 4 días:\n\n${listaNombres}\n\nQue tengas un buen día.`;
            await enviarEmail(emailSubject, textContent);
        } else {
            console.log(`--- No se encontraron cumpleaños de ${tabla} en 4 días. No se envía email. ---`);
        }
    } catch (error) {
        console.error(`Error en el cron job (4 días) para ${tabla}:`, error);
    }
}

async function revisarCumpleanosHoy(tabla, campoFecha, emailSubject, campoNombre = 'nombre_completo') {
    try {
        const sqlQuery = `
            SELECT ${mysql.escapeId(campoNombre)} AS nombre_completo
            FROM ${mysql.escapeId(tabla)} 
            WHERE 
                ${mysql.escapeId(campoFecha)} IS NOT NULL
                AND
                MONTH(${mysql.escapeId(campoFecha)}) = MONTH(CURDATE())
                AND 
                DAY(${mysql.escapeId(campoFecha)}) = DAY(CURDATE());
        `;
        const [resultados] = await dbPool.query(sqlQuery);

        if (resultados.length > 0) {
            console.log(`¡Encontrados ${resultados.length} cumpleaños de ${tabla} (HOY)! Enviando email...`);
            const listaNombres = resultados.map(p => `- ${p.nombre_completo}`).join('\n');
            const textContent = `¡Hola! \n\nEstas personas de ${tabla} cumplen años HOY:\n\n${listaNombres}\n\n¡No olvides felicitarlas!`;
            await enviarEmail(emailSubject, textContent);
        } else {
            console.log(`--- No se encontraron cumpleaños de ${tabla} (HOY). No se envía email. ---`);
        }
    } catch (error) {
        console.error(`Error en el cron job (HOY) para ${tabla}:`, error);
    }
}
// ---- FIN FUNCIONES CRON ----


// 5. RUTAS API (Endpoints)
// -----------------------------------------------------------------

// ---- RUTAS DE AUTENTICACIÓN (LOGIN) ----
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, nombre_completo, rol } = req.body;
        if (!email || !password || !rol) {
            return res.status(400).json({ mensaje: "Email, contraseña y rol son requeridos." });
        }
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        const sqlQuery = `
            INSERT INTO usuarios (email, password_hash, nombre_completo, rol) 
            VALUES (?, ?, ?, ?)
        `;
        await dbPool.query(sqlQuery, [email, password_hash, nombre_completo, rol]);
        res.status(201).json({ mensaje: `Usuario ${email} registrado con éxito.` });
    } catch (error) {
        console.error("Error al registrar usuario:", error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ mensaje: "Este email ya está registrado." });
        }
        res.status(500).json({ mensaje: "Error en el servidor al registrar." });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const sqlQuery = "SELECT * FROM usuarios WHERE email = ?";
        const [usuarios] = await dbPool.query(sqlQuery, [email]);
        const usuario = usuarios[0];
        if (!usuario) {
            return res.status(400).json({ mensaje: "Credenciales incorrectas (email)." });
        }
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(400).json({ mensaje: "Credenciales incorrectas (contraseña)." });
        }
        const payload = {
            id: usuario.id,
            email: usuario.email,
            rol: usuario.rol
        };
        const token = jwt.sign(
            payload, 
            process.env.JWT_SECRET,
            { expiresIn: '1d' } 
        );
        res.json({
            mensaje: "Login exitoso",
            token: token,
            usuario: {
                nombre: usuario.nombre_completo,
                rol: usuario.rol
            }
        });
    } catch (error) {
        console.error("Error en el login:", error);
        res.status(500).json({ mensaje: "Error en el servidor al iniciar sesión." });
    }
});
// ---- FIN RUTAS AUTENTICACIÓN ----


// ---- RUTAS MÓDULO 1: VOLUNTARIOS ----
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
// ---- FIN RUTAS VOLUNTARIOS ----


// ---- RUTAS MÓDULO 2: BENEFACTORES ----

// CORREGIDO: Se usa 'nombre_benefactor' y se le pone alias 'nombre_completo' para el frontend
app.get('/api/benefactores/hoy', async (req, res) => {
    console.log("¡Recibida petición para cumpleaños de benefactores de hoy!");
    try {
        const sqlQuery = `
            SELECT nombre_benefactor AS nombre_completo, fecha_fundacion_o_cumpleanos 
            FROM benefactores 
            WHERE 
                fecha_fundacion_o_cumpleanos IS NOT NULL AND
                MONTH(fecha_fundacion_o_cumpleanos) = MONTH(CURDATE()) 
                AND 
                DAY(fecha_fundacion_o_cumpleanos) = DAY(CURDATE());
        `;
        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);
    } catch (error) {
        console.error("Error al consultar cumpleaños benefactores:", error);
        res.status(500).json({ mensaje: "Error en el servidor", detalle: error.message });
    }
});

// CORREGIDO: Se usa 'nombre_benefactor' como 'nombre_completo'
app.get('/api/benefactores/pagos', async (req, res) => {
    console.log("¡Recibida petición para pagos de benefactores!");
    try {
        const sqlQuery = `
            SELECT id, nombre_benefactor AS nombre_completo, fecha_proximo_pago, estado_pago 
            FROM benefactores
            WHERE 
                (estado_pago = 'Pendiente' OR estado_pago = 'Vencido')
                AND
                fecha_proximo_pago IS NOT NULL
                AND
                fecha_proximo_pago <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ORDER BY
                fecha_proximo_pago ASC;
        `;
        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);
    } catch (error) {
        console.error("Error al consultar pagos:", error);
        res.status(500).json({ mensaje: "Error en el servidor", detalle: error.message });
    }
});


// Ruta para CREAR BENEFACTOR y su primera DONACIÓN
// CORREGIDO: Insertar en 'nombre_benefactor' y 'numero_contacto'
app.post('/api/benefactores/nuevo', async (req, res) => {
    console.log('Recibida solicitud para crear nuevo benefactor');
    const connection = await dbPool.getConnection();
    
    try {
        await connection.beginTransaction();
        const benefactorData = req.body;

        const telefonosString = JSON.stringify(benefactorData.telefonos);
        const correosString = JSON.stringify(benefactorData.correos);

        // 1. Insertar en 'benefactores' (Nombres de columna actualizados a tu DB real)
        const benefactorQuery = `
            INSERT INTO benefactores (
                cod_1_tipo, naturaleza, tipo_documento, numero_documento, nombre_benefactor,
                nombre_contactado, 
                numero_contacto, 
                correo, 
                fecha_fundacion_o_cumpleanos,
                direccion, departamento, ciudad, empresa, cargo, estado_civil, conyuge,
                protocolo, contacto_saciar, estado, autorizacion_datos, fecha_rut_actualizado,
                certificado_donacion, certificado_donacion_detalle, fecha_actualizacion_clinton,
                antecedentes_judiciales, encuesta_satisfaccion,
                estado_pago, fecha_proximo_pago
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pendiente', NULL)
        `;
        
        const [benefactorResult] = await connection.query(benefactorQuery, [
            benefactorData.cod_1_tipo,
            benefactorData.naturaleza,
            benefactorData.tipo_documento,
            benefactorData.numero_documento,
            benefactorData.nombre_completo, // El frontend envía 'nombre_completo', lo guardamos en 'nombre_benefactor'
            benefactorData.nombre_contactado,
            
            telefonosString, // Se guarda en 'numero_contacto'
            correosString,   // Se guarda en 'correo'
            
            benefactorData.fecha_fundacion_o_cumpleanos || null,
            benefactorData.direccion,
            benefactorData.departamento,
            benefactorData.ciudad,
            benefactorData.empresa,
            benefactorData.cargo,
            benefactorData.estado_civil || null,
            benefactorData.conyuge,
            benefactorData.protocolo,
            benefactorData.contacto_saciar,
            benefactorData.estado,
            benefactorData.autorizacion_datos,
            benefactorData.fecha_rut_actualizado,
            benefactorData.certificado_donacion,
            benefactorData.certificado_donacion_detalle,
            benefactorData.fecha_actualizacion_clinton || null,
            benefactorData.antecedentes_judiciales,
            benefactorData.encuesta_satisfaccion
        ]);

        const newBenefactorId = benefactorResult.insertId;

        // 2. Insertar en 'donaciones'
        const donacionQuery = `
            INSERT INTO donaciones (
                benefactor_id, tipo_donacion, procedencia, procedencia_2, detalles_donacion,
                fecha_donacion, observaciones
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        await connection.query(donacionQuery, [
            newBenefactorId,
            benefactorData.tipo_donacion,
            benefactorData.procedencia,
            benefactorData.procedencia_2,
            benefactorData.detalles_donacion,
            benefactorData.fecha_donacion,
            benefactorData.observaciones
        ]);

        await connection.commit();
        res.status(201).json({ mensaje: "Benefactor y donación creados con éxito", id: newBenefactorId });

    } catch (error) {
        await connection.rollback();
        console.error("Error al crear benefactor:", error);
        res.status(500).json({ mensaje: "Error al guardar en la base de datos", error: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/benefactores/buscar', async (req, res) => {
    try {
        const { nombre } = req.query;
        if (!nombre) {
            return res.json([]);
        }
        const searchTerm = `%${nombre}%`;
        // Buscamos por nombre del benefactor o por la empresa
        const sqlQuery = `
            SELECT id, nombre_benefactor AS nombre_completo, empresa, fecha_fundacion_o_cumpleanos AS fecha_nacimiento 
            FROM benefactores 
            WHERE nombre_benefactor LIKE ? OR empresa LIKE ?
            ORDER BY nombre_benefactor ASC
            LIMIT 10;
        `;
        // Pasamos el término de búsqueda dos veces (una para nombre, otra para empresa)
        const [resultados] = await dbPool.query(sqlQuery, [searchTerm, searchTerm]);
        res.json(resultados);
    } catch (error) {
        console.error("Error en la búsqueda de benefactores:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});
// ---- FIN RUTAS BENEFACTORES ----


// ---- RUTAS MÓDULO 3: TRANSPORTE ----
app.get('/api/transporte/vencimientos', async (req, res) => {
    console.log("¡Recibida petición para vencimientos de transporte!");
    try {
        const sqlQuery = `
            SELECT
                placa,
                descripcion,
                conductor_asignado,
                fecha_vencimiento_soat,
                fecha_vencimiento_tecnomecanica,
                fecha_vencimiento_licencia
            FROM 
                vehiculos
            WHERE
                (fecha_vencimiento_soat <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
            OR
                (fecha_vencimiento_tecnomecanica <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
            OR
                (fecha_vencimiento_licencia <= DATE_ADD(CURDATE(), INTERVAL 30 DAY))
            ORDER BY
                LEAST(
                    IFNULL(fecha_vencimiento_soat, '9999-12-31'), 
                    IFNULL(fecha_vencimiento_tecnomecanica, '9999-12-31'),
                    IFNULL(fecha_vencimiento_licencia, '9999-12-31')
                ) ASC;
        `;

        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);
    } catch (error) {
        console.error("Error al consultar vencimientos de transporte:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});
// ---- FIN RUTAS TRANSPORTE ----


// ---- RUTAS DE PRUEBA ----
app.get('/api/test-email-hoy', (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (HOY) INICIADA!!");
    res.json({ mensaje: "Prueba de email (HOY) iniciada. Revisa los logs." });
    // Por defecto voluntario
    revisarCumpleanosHoy('voluntarios', 'fecha_nacimiento', 'TEST VOLUNTARIO', 'nombre_completo'); 
    // Y benefactor
    revisarCumpleanosHoy('benefactores', 'fecha_fundacion_o_cumpleanos', 'TEST BENEFACTOR', 'nombre_benefactor'); 
});
app.get('/api/test-email-4dias', (req, res) => {
    console.log("¡¡PRUEBA MANUAL DE EMAIL (4 DÍAS) INICIADA!!");
    res.json({ mensaje: "Prueba de email (4 DÍAS) iniciada. Revisa los logs." });
    revisarCumpleanosCuatroDias('voluntarios', 'fecha_nacimiento', 'TEST VOL', 'nombre_completo');
    revisarCumpleanosCuatroDias('benefactores', 'fecha_fundacion_o_cumpleanos', 'TEST BEN', 'nombre_benefactor');
});
// ---- FIN DE RUTAS DE PRUEBA ----

// ---- RUTA OPTIMIZADA: OBTENER BENEFACTORES CON PAGINACIÓN Y BÚSQUEDA ----
app.get('/api/benefactores/todos', async (req, res) => {
    try {
        // 1. Recibimos parámetros (con valores por defecto)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20; // 20 items por página
        const search = req.query.search || ''; // Texto de búsqueda opcional
        const offset = (page - 1) * limit;

        // 2. Preparamos la condición de búsqueda (WHERE)
        let whereClause = '';
        let queryParams = [];

        if (search) {
            whereClause = 'WHERE nombre_benefactor LIKE ? OR numero_documento LIKE ?';
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        // 3. Consulta PRINCIPAL (Datos)
        // Añadimos LIMIT y OFFSET para traer solo la página actual
        const sqlData = `
            SELECT * FROM benefactores 
            ${whereClause}
            ORDER BY nombre_benefactor ASC 
            LIMIT ? OFFSET ?
        `;
        // Añadimos limit y offset a los parámetros
        const dataParams = [...queryParams, limit, offset];
        const [rows] = await dbPool.query(sqlData, dataParams);

        // 4. Consulta de CONTEO (Para saber cuántas páginas hay en total)
        const sqlCount = `SELECT COUNT(*) as total FROM benefactores ${whereClause}`;
        const [countResult] = await dbPool.query(sqlCount, queryParams);
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        // 5. Enviamos la respuesta estructurada
        res.json({
            data: rows,
            pagination: {
                page,
                limit,
                totalItems,
                totalPages
            }
        });

    } catch (error) {
        console.error("Error al obtener lista paginada:", error);
        res.status(500).json({ mensaje: "Error al obtener la lista" });
    }
});

// 6. Iniciar el servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor API corriendo en puerto ${PORT}`);
    console.log('Tareas CRON (Voluntarios y Benefactores) activadas.');
});
