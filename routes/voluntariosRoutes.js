const express = require('express');
const router = express.Router();
const dbPool = require('../config/db');

// 1. Cumpleaños HOY
router.get('/hoy', async (req, res) => {
    try {
        const sqlQuery = `
            SELECT nombre_completo, fecha_nacimiento 
            FROM voluntarios 
            WHERE MONTH(fecha_nacimiento) = MONTH(CURDATE()) AND DAY(fecha_nacimiento) = DAY(CURDATE());
        `;
        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);
    } catch (error) {
        console.error("Error cumpleaños hoy:", error);
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

// 2. Próximos Cumpleaños
router.get('/proximos', async (req, res) => {
    try {
        const sqlQuery = `
            WITH CumpleanosProximos AS (
                SELECT nombre_completo, fecha_nacimiento,
                    DATE_ADD(DATE_SUB(CURDATE(), INTERVAL DAYOFYEAR(CURDATE()) - 1 DAY), INTERVAL DAYOFYEAR(fecha_nacimiento) - 1 DAY) AS cumple_este_ano
                FROM voluntarios WHERE fecha_nacimiento IS NOT NULL
            )
            SELECT nombre_completo, fecha_nacimiento,
                CASE WHEN cumple_este_ano < CURDATE() THEN DATE_ADD(cumple_este_ano, INTERVAL 1 YEAR) ELSE cumple_este_ano END AS proxima_fecha
            FROM CumpleanosProximos
            HAVING proxima_fecha BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ORDER BY proxima_fecha ASC;
        `;
        const [resultados] = await dbPool.query(sqlQuery);
        res.json(resultados);
    } catch (error) {
        console.error("Error próximos:", error);
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

// 3. Resumen (Contadores)
router.get('/resumen', async (req, res) => {
    try {
        const sqlHoy = `SELECT COUNT(*) as count FROM voluntarios WHERE MONTH(fecha_nacimiento) = MONTH(CURDATE()) AND DAY(fecha_nacimiento) = DAY(CURDATE());`;
        const sqlProximos = `
            SELECT COUNT(*) as count FROM (
                WITH CumpleanosProximos AS (
                    SELECT fecha_nacimiento,
                        DATE_ADD(DATE_SUB(CURDATE(), INTERVAL DAYOFYEAR(CURDATE()) - 1 DAY), INTERVAL DAYOFYEAR(fecha_nacimiento) - 1 DAY) AS cumple_este_ano
                    FROM voluntarios WHERE fecha_nacimiento IS NOT NULL
                )
                SELECT CASE WHEN cumple_este_ano < CURDATE() THEN DATE_ADD(cumple_este_ano, INTERVAL 1 YEAR) ELSE cumple_este_ano END AS proxima_fecha
                FROM CumpleanosProximos
                HAVING proxima_fecha BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            ) as SubQuery;
        `;
        const [resHoy, resProximos] = await Promise.all([dbPool.query(sqlHoy), dbPool.query(sqlProximos)]);
        res.json({ hoy: resHoy[0][0].count, proximos: resProximos[0][0].count });
    } catch (error) {
        console.error("Error resumen:", error);
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

// 4. OBTENER TODOS (LISTA PAGINADA Y BÚSQUEDA) - ¡NUEVO!
router.get('/todos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let queryParams = [];

        if (search) {
            whereClause = 'WHERE nombre_completo LIKE ? OR correo LIKE ?';
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const sqlData = `SELECT * FROM voluntarios ${whereClause} ORDER BY nombre_completo ASC LIMIT ? OFFSET ?`;
        const [rows] = await dbPool.query(sqlData, [...queryParams, limit, offset]);

        const sqlCount = `SELECT COUNT(*) as total FROM voluntarios ${whereClause}`;
        const [countResult] = await dbPool.query(sqlCount, queryParams);

        res.json({
            data: rows,
            pagination: { page, limit, totalItems: countResult[0].total, totalPages: Math.ceil(countResult[0].total / limit) }
        });
    } catch (error) {
        console.error("Error lista voluntarios:", error);
        res.status(500).json({ mensaje: "Error al obtener lista" });
    }
});

// 5. CREAR VOLUNTARIO - ¡NUEVO!
router.post('/nuevo', async (req, res) => {
    try {
        const { nombre_completo, fecha_nacimiento, telefono, correo, estado } = req.body;
        await dbPool.query(
            "INSERT INTO voluntarios (nombre_completo, fecha_nacimiento, telefono, correo, estado) VALUES (?, ?, ?, ?, ?)",
            [nombre_completo, fecha_nacimiento || null, telefono, correo, estado || 'Activo']
        );
        res.status(201).json({ mensaje: "Voluntario registrado" });
    } catch (error) {
        console.error("Error crear voluntario:", error);
        res.status(500).json({ mensaje: "Error al guardar" });
    }
});

// 6. EDITAR VOLUNTARIO - ¡NUEVO!
router.put('/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre_completo, fecha_nacimiento, telefono, correo, estado } = req.body;
        
        await dbPool.query(
            "UPDATE voluntarios SET nombre_completo=?, fecha_nacimiento=?, telefono=?, correo=?, estado=? WHERE id=?",
            [nombre_completo, fecha_nacimiento || null, telefono, correo, estado, id]
        );
        res.json({ mensaje: "Voluntario actualizado" });
    } catch (error) {
        console.error("Error editar voluntario:", error);
        res.status(500).json({ mensaje: "Error al actualizar" });
    }
});

// 7. ELIMINAR VOLUNTARIO - ¡NUEVO!
router.delete('/eliminar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await dbPool.query("DELETE FROM voluntarios WHERE id = ?", [id]);
        res.json({ mensaje: "Voluntario eliminado" });
    } catch (error) {
        console.error("Error eliminar voluntario:", error);
        res.status(500).json({ mensaje: "Error al eliminar" });
    }
});

// 8. BUSCADOR RÁPIDO (Header)
router.get('/buscar', async (req, res) => {
    try {
        const { nombre } = req.query;
        if (!nombre) return res.json([]);
        const searchTerm = `%${nombre}%`;
        const [resultados] = await dbPool.query(
            "SELECT id, nombre_completo, fecha_nacimiento FROM voluntarios WHERE nombre_completo LIKE ? LIMIT 10", 
            [searchTerm]
        );
        res.json(resultados);
    } catch (error) {
        console.error("Error búsqueda rápida:", error);
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

module.exports = router;