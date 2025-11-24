const express = require('express');
const router = express.Router();
const dbPool = require('../config/db'); // Importamos la conexión

// 1. OBTENER CUMPLEAÑOS DE HOY
router.get('/hoy', async (req, res) => {
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
        console.error("Error benefactores hoy:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// 2. OBTENER PAGOS PENDIENTES
router.get('/pagos', async (req, res) => {
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
        console.error("Error pagos:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// 3. CREAR NUEVO BENEFACTOR (Con Transacción)
router.post('/nuevo', async (req, res) => {
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        const benefactorData = req.body;

        const telefonosString = JSON.stringify(benefactorData.telefonos);
        const correosString = JSON.stringify(benefactorData.correos);

        const benefactorQuery = `
            INSERT INTO benefactores (
                cod_1_tipo, naturaleza, tipo_documento, numero_documento, nombre_benefactor,
                nombre_contactado, numero_contacto, correo, fecha_fundacion_o_cumpleanos,
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
            benefactorData.nombre_completo,
            benefactorData.nombre_contactado,
            telefonosString,
            correosString,
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
        res.status(201).json({ mensaje: "Benefactor creado con éxito", id: newBenefactorId });

    } catch (error) {
        await connection.rollback();
        console.error("Error al crear benefactor:", error);
        res.status(500).json({ mensaje: "Error al guardar", error: error.message });
    } finally {
        connection.release();
    }
});

// 4. OBTENER TODOS (Con Paginación y Búsqueda)
router.get('/todos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        let whereClause = '';
        let queryParams = [];

        if (search) {
            whereClause = 'WHERE nombre_benefactor LIKE ? OR numero_documento LIKE ?';
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        const sqlData = `
            SELECT * FROM benefactores 
            ${whereClause}
            ORDER BY nombre_benefactor ASC 
            LIMIT ? OFFSET ?
        `;
        const dataParams = [...queryParams, limit, offset];
        const [rows] = await dbPool.query(sqlData, dataParams);

        const sqlCount = `SELECT COUNT(*) as total FROM benefactores ${whereClause}`;
        const [countResult] = await dbPool.query(sqlCount, queryParams);
        
        const totalItems = countResult[0].total;
        const totalPages = Math.ceil(totalItems / limit);

        res.json({
            data: rows,
            pagination: { page, limit, totalItems, totalPages }
        });

    } catch (error) {
        console.error("Error lista paginada:", error);
        res.status(500).json({ mensaje: "Error al obtener lista" });
    }
});

// 5. BUSCADOR RÁPIDO (Para la barra del Header)
router.get('/buscar', async (req, res) => {
    try {
        const { nombre } = req.query;
        if (!nombre) return res.json([]);
        
        const searchTerm = `%${nombre}%`;
        const sqlQuery = `
            SELECT id, nombre_benefactor AS nombre_completo, empresa, fecha_fundacion_o_cumpleanos AS fecha_nacimiento 
            FROM benefactores 
            WHERE nombre_benefactor LIKE ? OR empresa LIKE ?
            ORDER BY nombre_benefactor ASC
            LIMIT 10;
        `;
        const [resultados] = await dbPool.query(sqlQuery, [searchTerm, searchTerm]);
        res.json(resultados);
    } catch (error) {
        console.error("Error búsqueda rápida:", error);
        res.status(500).json({ mensaje: "Error en el servidor" });
    }
});

// 6. ACTUALIZAR BENEFACTOR
router.put('/editar/:id', async (req, res) => {
    const { id } = req.params;
    const benefactorData = req.body;

    try {
        const telefonosString = JSON.stringify(benefactorData.telefonos);
        const correosString = JSON.stringify(benefactorData.correos);

        const sqlQuery = `
            UPDATE benefactores SET
                cod_1_tipo = ?, naturaleza = ?, tipo_documento = ?, numero_documento = ?, 
                nombre_benefactor = ?, nombre_contactado = ?, numero_contacto = ?, correo = ?, 
                fecha_fundacion_o_cumpleanos = ?, direccion = ?, departamento = ?, ciudad = ?, 
                empresa = ?, cargo = ?, estado_civil = ?, conyuge = ?, protocolo = ?, 
                contacto_saciar = ?, estado = ?, autorizacion_datos = ?, fecha_rut_actualizado = ?, 
                certificado_donacion = ?, certificado_donacion_detalle = ?, fecha_actualizacion_clinton = ?, 
                antecedentes_judiciales = ?, encuesta_satisfaccion = ?
            WHERE id = ?
        `;

        await dbPool.query(sqlQuery, [
            benefactorData.cod_1_tipo, benefactorData.naturaleza, benefactorData.tipo_documento, 
            benefactorData.numero_documento, benefactorData.nombre_completo, benefactorData.nombre_contactado,
            telefonosString, correosString, benefactorData.fecha_fundacion_o_cumpleanos || null,
            benefactorData.direccion, benefactorData.departamento, benefactorData.ciudad,
            benefactorData.empresa, benefactorData.cargo, benefactorData.estado_civil || null,
            benefactorData.conyuge, benefactorData.protocolo, benefactorData.contacto_saciar,
            benefactorData.estado, benefactorData.autorizacion_datos, benefactorData.fecha_rut_actualizado,
            benefactorData.certificado_donacion, benefactorData.certificado_donacion_detalle,
            benefactorData.fecha_actualizacion_clinton || null, benefactorData.antecedentes_judiciales,
            benefactorData.encuesta_satisfaccion,
            id
        ]);

        res.json({ mensaje: "Benefactor actualizado correctamente" });
    } catch (error) {
        console.error("Error al actualizar:", error);
        res.status(500).json({ mensaje: "Error al actualizar datos" });
    }
});

module.exports = router;