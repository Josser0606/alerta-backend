// 1. IMPORTACIONES
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const mysql = require('mysql2'); // Necesario para mysql.escapeId en cron jobs
require('dotenv').config();

// Importar Conexión BD y Rutas
const dbPool = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const voluntariosRoutes = require('./routes/voluntariosRoutes');
const benefactoresRoutes = require('./routes/benefactoresRoutes');
const transporteRoutes = require('./routes/transporteRoutes');

// 2. CONFIGURACIÓN EXPRESS
const app = express();
app.use(cors());
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// 3. USAR RUTAS
app.use('/api/auth', authRoutes);
app.use('/api/voluntarios', voluntariosRoutes);
app.use('/api/benefactores', benefactoresRoutes);
app.use('/api/transporte', transporteRoutes);

// Ruta de prueba rápida
app.get('/api/test-email-hoy', (req, res) => {
    res.json({ mensaje: "Test de email iniciado. Revisa consola." });
    revisarCumpleanosHoy('voluntarios', 'fecha_nacimiento', 'TEST VOL', 'nombre_completo');
});


// 4. LÓGICA DE EMAILS Y CRON JOBS
// (Mantenemos esto aquí para que el servidor principal controle las tareas automáticas)

async function enviarEmail(subject, textContent) {
    console.log(`>>> Intentando enviar email: "${subject}"`);
    const url = 'https://api.brevo.com/v3/smtp/email';
    const apiKey = process.env.EMAIL_PASS;
    const emailRemitente = process.env.EMAIL_USER;

    if (!apiKey || !emailRemitente) {
        console.error("ERROR: Faltan credenciales de email en .env");
        return false;
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({
                sender: { email: emailRemitente },
                to: [{ email: emailRemitente }],
                subject: subject,
                textContent: textContent
            })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(`Brevo Error: ${JSON.stringify(err)}`);
        }
        console.log(">>> Email enviado con éxito.");
        return true;
    } catch (error) {
        console.error('Error enviando email:', error);
        return false;
    }
}

// --- DEFINICIÓN DE CRON JOBS ---

// Voluntarios (4 días y Hoy)
cron.schedule('0 8 * * *', () => revisarCumpleanosCuatroDias('voluntarios', 'fecha_nacimiento', '🔔 Alerta: Cumpleaños Voluntarios (4 días)', 'nombre_completo'), { timezone: "America/Bogota" });
cron.schedule('1 8 * * *', () => revisarCumpleanosHoy('voluntarios', 'fecha_nacimiento', '🎂 ¡Feliz Cumpleaños Voluntario!', 'nombre_completo'), { timezone: "America/Bogota" });

// Benefactores (4 días y Hoy)
cron.schedule('2 8 * * *', () => revisarCumpleanosCuatroDias('benefactores', 'fecha_fundacion_o_cumpleanos', '🔔 Alerta: Cumpleaños Benefactores (4 días)', 'nombre_benefactor'), { timezone: "America/Bogota" });
cron.schedule('3 8 * * *', () => revisarCumpleanosHoy('benefactores', 'fecha_fundacion_o_cumpleanos', '🎂 ¡Feliz Cumpleaños Benefactor!', 'nombre_benefactor'), { timezone: "America/Bogota" });


// --- FUNCIONES AUXILIARES PARA CRON ---
async function revisarCumpleanosCuatroDias(tabla, campoFecha, emailSubject, campoNombre) {
    try {
        const sql = `SELECT ${mysql.escapeId(campoNombre)} AS nombre_completo FROM ${mysql.escapeId(tabla)} 
                     WHERE ${mysql.escapeId(campoFecha)} IS NOT NULL 
                     AND MONTH(${mysql.escapeId(campoFecha)}) = MONTH(DATE_ADD(CURDATE(), INTERVAL 4 DAY)) 
                     AND DAY(${mysql.escapeId(campoFecha)}) = DAY(DATE_ADD(CURDATE(), INTERVAL 4 DAY))`;
        const [res] = await dbPool.query(sql);
        if (res.length > 0) {
            const lista = res.map(p => `- ${p.nombre_completo}`).join('\n');
            await enviarEmail(emailSubject, `¡Hola! \n\nCumplen años en 4 días:\n\n${lista}`);
        }
    } catch (e) { console.error(`Error Cron 4dias ${tabla}:`, e); }
}

async function revisarCumpleanosHoy(tabla, campoFecha, emailSubject, campoNombre) {
    try {
        const sql = `SELECT ${mysql.escapeId(campoNombre)} AS nombre_completo FROM ${mysql.escapeId(tabla)} 
                     WHERE ${mysql.escapeId(campoFecha)} IS NOT NULL 
                     AND MONTH(${mysql.escapeId(campoFecha)}) = MONTH(CURDATE()) 
                     AND DAY(${mysql.escapeId(campoFecha)}) = DAY(CURDATE())`;
        const [res] = await dbPool.query(sql);
        if (res.length > 0) {
            const lista = res.map(p => `- ${p.nombre_completo}`).join('\n');
            await enviarEmail(emailSubject, `¡Hola! \n\nCumplen años HOY:\n\n${lista}\n\n¡Felicítalos!`);
        }
    } catch (e) { console.error(`Error Cron HOY ${tabla}:`, e); }
}

// 5. INICIAR SERVIDOR
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor API corriendo en puerto ${PORT}`);
    console.log('Tareas CRON activadas.');
});