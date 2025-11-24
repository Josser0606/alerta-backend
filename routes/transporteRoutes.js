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

// 3. LISTAR TODOS LOS VEHÍCULOS (Para la gestión)
router.get('/todos', async (req, res) => {
    try {
        // Buscador simple por placa o descripción
        const { search } = req.query;
        let sql = `SELECT * FROM vehiculos`;
        let params = [];

        if (search) {
            sql += ` WHERE placa LIKE ? OR descripcion LIKE ?`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        sql += ` ORDER BY placa ASC`;

        const [rows] = await dbPool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al listar vehículos:", error);
        res.status(500).json({ mensaje: "Error al obtener vehículos" });
    }
});

// 4. ACTUALIZAR VEHÍCULO
router.put('/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        placa, descripcion, conductor_asignado, 
        fecha_vencimiento_soat, fecha_vencimiento_tecnomecanica, fecha_vencimiento_licencia 
    } = req.body;

    try {
        const sql = `
            UPDATE vehiculos SET 
                placa = ?, descripcion = ?, conductor_asignado = ?,
                fecha_vencimiento_soat = ?, fecha_vencimiento_tecnomecanica = ?, fecha_vencimiento_licencia = ?
            WHERE id = ?
        `;
        
        await dbPool.query(sql, [
            placa, descripcion, conductor_asignado,
            fecha_vencimiento_soat || null, fecha_vencimiento_tecnomecanica || null, fecha_vencimiento_licencia || null,
            id
        ]);

        res.json({ mensaje: "Vehículo actualizado correctamente" });
    } catch (error) {
        console.error("Error al actualizar vehículo:", error);
        res.status(500).json({ mensaje: "Error al actualizar" });
    }
});

module.exports = router;