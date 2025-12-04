const express = require('express');
const router = express.Router();
const dbPool = require('../config/db');

// 1. LISTAR TODO (Con búsqueda por código o descripción)
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

// 2. CREAR ITEM
router.post('/nuevo', async (req, res) => {
    try {
        const data = req.body;
        const sql = `
            INSERT INTO inventario (
                codigo_serie, centro_operacion, area_principal, tipo_producto,
                descripcion, area_asignada, sub_area_asignada, cargo_asignado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await dbPool.query(sql, [
            data.codigo_serie, data.centro_operacion, data.area_principal, data.tipo_producto,
            data.descripcion, data.area_asignada, data.sub_area_asignada, data.cargo_asignado
        ]);
        res.status(201).json({ mensaje: "Item registrado con éxito" });
    } catch (error) {
        console.error("Error al crear item:", error);
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ mensaje: "El código de serie ya existe." });
        res.status(500).json({ mensaje: "Error al guardar" });
    }
});

// 3. EDITAR ITEM
router.put('/editar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const sql = `
            UPDATE inventario SET
                codigo_serie=?, centro_operacion=?, area_principal=?, tipo_producto=?,
                descripcion=?, area_asignada=?, sub_area_asignada=?, cargo_asignado=?
            WHERE id=?
        `;
        await dbPool.query(sql, [
            data.codigo_serie, data.centro_operacion, data.area_principal, data.tipo_producto,
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