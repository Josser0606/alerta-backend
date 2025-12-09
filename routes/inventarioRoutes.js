const express = require('express');
const router = express.Router();
const dbPool = require('../config/db');

// 1. LISTAR TODO
router.get('/todos', async (req, res) => {
    try {
        const { search } = req.query;
        let sql = `SELECT * FROM inventario`;
        let params = [];

        if (search) {
            sql += ` WHERE codigo_serie LIKE ? OR descripcion LIKE ?`;
            params.push(`%${search}%`, `%${search}%`);
        }
        
        sql += ` ORDER BY codigo_serie ASC`;

        const [rows] = await dbPool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al listar inventario:", error);
        res.status(500).json({ mensaje: "Error al obtener inventario" });
    }
});

// 2. OBTENER SIGUIENTE CÓDIGO
router.get('/siguiente-codigo/:categoria', async (req, res) => {
    try {
        const { categoria } = req.params;
        
        const sqlUltimo = `
            SELECT codigo_serie 
            FROM inventario 
            WHERE codigo_serie LIKE CONCAT(?, '%')
            ORDER BY LENGTH(codigo_serie) DESC, codigo_serie DESC 
            LIMIT 1
        `;
        
        const [rows] = await dbPool.query(sqlUltimo, [categoria]);
        
        let nuevoNumero = 1;
        
        if (rows.length > 0) {
            const ultimoCodigo = rows[0].codigo_serie;
            const parteNumerica = ultimoCodigo.replace(categoria, '');
            const numeroAnterior = parseInt(parteNumerica, 10);
            
            if (!isNaN(numeroAnterior)) {
                nuevoNumero = numeroAnterior + 1;
            }
        }
        
        const numeroFormateado = String(nuevoNumero).padStart(4, '0');
        const siguienteCodigo = `${categoria}${numeroFormateado}`;

        res.json({ siguienteCodigo });

    } catch (error) {
        console.error("Error al obtener siguiente código:", error);
        res.status(500).json({ mensaje: "Error al calcular código" });
    }
});

// 3. CREAR ITEM (CORREGIDO: AHORA GUARDA EL ESTADO)
router.post('/nuevo', async (req, res) => {
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const data = req.body;
        
        if (!data.categoria) {
            throw new Error("La categoría es obligatoria.");
        }

        // Calcular código (Doble verificación para evitar colisiones)
        const sqlUltimo = `
            SELECT codigo_serie FROM inventario 
            WHERE codigo_serie LIKE CONCAT(?, '%')
            ORDER BY LENGTH(codigo_serie) DESC, codigo_serie DESC LIMIT 1 FOR UPDATE
        `;
        const [rows] = await connection.query(sqlUltimo, [data.categoria]);
        
        let nuevoNumero = 1;
        if (rows.length > 0) {
            const num = parseInt(rows[0].codigo_serie.replace(data.categoria, ''), 10);
            if (!isNaN(num)) nuevoNumero = num + 1;
        }
        
        const nuevoCodigoSerie = `${data.categoria}${String(nuevoNumero).padStart(4, '0')}`;

        // --- AQUÍ ESTÁ LA CORRECCIÓN CLAVE ---
        // Agregamos 'estado' al INSERT
        const sqlInsert = `
            INSERT INTO inventario (
                codigo_serie, centro_operacion, area_principal, tipo_producto,
                descripcion, area_asignada, sub_area_asignada, cargo_asignado, categoria, estado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.query(sqlInsert, [
            nuevoCodigoSerie, 
            data.centro_operacion, 
            data.area_principal, 
            data.tipo_producto,
            data.descripcion, 
            data.area_asignada, 
            data.sub_area_asignada, 
            data.cargo_asignado, 
            data.categoria, 
            data.estado || 'Sin Prioridad' // Si no viene, pone 'Sin Prioridad'
        ]);

        await connection.commit();
        res.status(201).json({ mensaje: `Item registrado con éxito. Código: ${nuevoCodigoSerie}` });

    } catch (error) {
        await connection.rollback();
        console.error("Error al crear item:", error);
        res.status(500).json({ mensaje: error.message || "Error al guardar" });
    } finally {
        connection.release();
    }
});

// 4. EDITAR ITEM
router.put('/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const sql = `
            UPDATE inventario SET
                centro_operacion=?, area_principal=?, tipo_producto=?,
                descripcion=?, area_asignada=?, sub_area_asignada=?, cargo_asignado=?, estado=? 
            WHERE id=?
        `;
        await dbPool.query(sql, [
            data.centro_operacion, data.area_principal, data.tipo_producto,
            data.descripcion, data.area_asignada, data.sub_area_asignada, data.cargo_asignado,
            data.estado,
            id
        ]);
        res.json({ mensaje: "Item actualizado correctamente" });
    } catch (error) {
        console.error("Error al editar:", error);
        res.status(500).json({ mensaje: "Error al actualizar" });
    }
});

// 5. ELIMINAR ITEM
router.delete('/eliminar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await dbPool.query('DELETE FROM inventario WHERE id = ?', [id]);
        res.json({ mensaje: "Item eliminado" });
    } catch (error) {
        console.error("Error al eliminar:", error);
        res.status(500).json({ mensaje: "Error al eliminar" });
    }
});

// 6. RESUMEN POR CATEGORÍA
router.get('/resumen', async (req, res) => {
    try {
        const sql = `
            SELECT categoria, COUNT(*) as total 
            FROM inventario 
            GROUP BY categoria
            ORDER BY total DESC
        `;
        const [rows] = await dbPool.query(sql);
        res.json(rows);
    } catch (error) {
        console.error("Error resumen inventario:", error);
        res.status(500).json({ mensaje: "Error al obtener resumen" });
    }
});

module.exports = router;