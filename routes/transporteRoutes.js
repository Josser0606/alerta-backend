const express = require('express');
const router = express.Router();
const dbPool = require('../config/db');

// 1. Vencimientos de Documentos (SOAT, Tecno, Licencia)
router.get('/vencimientos', async (req, res) => {
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

// 2. Crear Nuevo Vehículo
router.post('/nuevo', async (req, res) => {
    try {
        const { 
            placa, 
            descripcion, 
            conductor_asignado, 
            fecha_vencimiento_soat, 
            fecha_vencimiento_tecnomecanica, 
            fecha_vencimiento_licencia 
        } = req.body;

        // Validación básica
        if (!placa) {
            return res.status(400).json({ mensaje: "La placa es obligatoria" });
        }

        const sqlQuery = `
            INSERT INTO vehiculos (
                placa, descripcion, conductor_asignado, 
                fecha_vencimiento_soat, fecha_vencimiento_tecnomecanica, fecha_vencimiento_licencia
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;

        await dbPool.query(sqlQuery, [
            placa, 
            descripcion, 
            conductor_asignado, 
            fecha_vencimiento_soat || null, 
            fecha_vencimiento_tecnomecanica || null, 
            fecha_vencimiento_licencia || null
        ]);

        res.status(201).json({ mensaje: "Vehículo registrado con éxito" });

    } catch (error) {
        console.error("Error al crear vehículo:", error);
        // Manejo de error por si la placa ya existe (código SQL ER_DUP_ENTRY)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ mensaje: "Ya existe un vehículo con esa placa." });
        }
        res.status(500).json({ mensaje: "Error al guardar el vehículo" });
    }
});

module.exports = router;