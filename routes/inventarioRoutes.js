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
        
        sql += ` ORDER BY id DESC`;

        const [rows] = await dbPool.query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error("Error al listar inventario:", error);
        res.status(500).json({ mensaje: "Error al obtener inventario" });
    }
});

// 2. CREAR ITEM (CORREGIDO: Generación de código robusta)
router.post('/nuevo', async (req, res) => {
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        
        const data = req.body;
        
        if (!data.categoria) {
            throw new Error("La categoría es obligatoria para generar el código.");
        }

        // --- CORRECCIÓN AQUÍ ---
        // Buscamos por el CÓDIGO (texto) más alto, no por el ID.
        // Usamos 'LIKE' para encontrar cualquier código que empiece con el prefijo (ej: FLT%)
        // Ordenamos por longitud primero y luego por texto para que FLT10 sea mayor que FLT2
        const sqlUltimo = `
            SELECT codigo_serie 
            FROM inventario 
            WHERE codigo_serie LIKE CONCAT(?, '%')
            ORDER BY LENGTH(codigo_serie) DESC, codigo_serie DESC 
            LIMIT 1
        `;
        
        const [rows] = await connection.query(sqlUltimo, [data.categoria]);
        
        let nuevoNumero = 1;
        
        if (rows.length > 0) {
            const ultimoCodigo = rows[0].codigo_serie; // Ej: FLT0005
            // Quitamos las letras de la categoría para quedarnos solo con el número
            const parteNumerica = ultimoCodigo.replace(data.categoria, '');
            const numeroAnterior = parseInt(parteNumerica, 10);
            
            if (!isNaN(numeroAnterior)) {
                nuevoNumero = numeroAnterior + 1;
            }
        }
        
        // Rellenamos con ceros (ej: 0006)
        const numeroFormateado = String(nuevoNumero).padStart(4, '0');
        const nuevoCodigoSerie = `${data.categoria}${numeroFormateado}`;

        const sqlInsert = `
            INSERT INTO inventario (
                codigo_serie, centro_operacion, area_principal, tipo_producto,
                descripcion, area_asignada, sub_area_asignada, cargo_asignado, categoria
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        await connection.query(sqlInsert, [
            nuevoCodigoSerie, data.centro_operacion, data.area_principal, data.tipo_producto,
            data.descripcion, data.area_asignada, data.sub_area_asignada, data.cargo_asignado, 
            data.categoria 
        ]);

        await connection.commit();
        res.status(201).json({ mensaje: `Item registrado con éxito. Código: ${nuevoCodigoSerie}` });

    } catch (error) {
        await connection.rollback();
        console.error("Error al crear item:", error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ mensaje: "El código generado ya existe. Intente nuevamente." });
        res.status(500).json({ mensaje: error.message || "Error al guardar" });
    } finally {
        connection.release();
    }
});

// 3. EDITAR ITEM
router.put('/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        
        const sql = `
            UPDATE inventario SET
                centro_operacion=?, area_principal=?, tipo_producto=?,
                descripcion=?, area_asignada=?, sub_area_asignada=?, cargo_asignado=?
            WHERE id=?
        `;
        await dbPool.query(sql, [
            data.centro_operacion, data.area_principal, data.tipo_producto,
            data.descripcion, data.area_asignada, data.sub_area_asignada, data.cargo_asignado,
            id
        ]);
        res.json({ mensaje: "Item actualizado correctamente" });
    } catch (error) {
        console.error("Error al editar:", error);
        res.status(500).json({ mensaje: "Error al actualizar" });
    }
});

// 4. ELIMINAR ITEM
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

module.exports = router;