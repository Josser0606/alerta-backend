const express = require('express');
const router = express.Router();
const dbPool = require('../config/db'); // Importamos la conexión

// --- FUNCIÓN AUXILIAR PARA EDICIÓN INTELIGENTE ---
// Decide si usa el dato nuevo (si existe) o mantiene el viejo (de la BD)
const mantenerOActualizar = (nuevo, viejo) => {
    if (nuevo !== undefined && nuevo !== null && nuevo !== "") {
        return nuevo;
    }
    return viejo;
};

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

// 8. RESUMEN (Para la campanita)
router.get('/resumen', async (req, res) => {
    try {
        // Contar cumpleaños de HOY
        const sqlHoy = `
            SELECT COUNT(*) as count 
            FROM benefactores 
            WHERE fecha_fundacion_o_cumpleanos IS NOT NULL 
            AND MONTH(fecha_fundacion_o_cumpleanos) = MONTH(CURDATE()) 
            AND DAY(fecha_fundacion_o_cumpleanos) = DAY(CURDATE());
        `;
        
        // Contar pagos pendientes próximos (7 días)
        const sqlPagos = `
            SELECT COUNT(*) as count 
            FROM benefactores
            WHERE (estado_pago = 'Pendiente' OR estado_pago = 'Vencido')
            AND fecha_proximo_pago <= DATE_ADD(CURDATE(), INTERVAL 7 DAY);
        `;

        const [resHoy, resPagos] = await Promise.all([
            dbPool.query(sqlHoy),
            dbPool.query(sqlPagos)
        ]);

        // Devolvemos una estructura similar para que el frontend la entienda fácil
        // 'hoy' = cumpleaños, 'proximos' = pagos pendientes
        res.json({ hoy: resHoy[0][0].count, proximos: resPagos[0][0].count });

    } catch (error) {
        console.error("Error resumen benefactores:", error);
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

// 5. BUSCADOR RÁPIDO
router.get('/buscar', async (req, res) => {
    try {
        const { nombre } = req.query;
        if (!nombre) return res.json([]);
        
        const searchTerm = `%${nombre}%`;

        // --- CORRECCIÓN AQUÍ: Agregamos LOWER() ---
        const sqlQuery = `
            SELECT id, nombre_benefactor AS nombre_completo, empresa, fecha_fundacion_o_cumpleanos AS fecha_nacimiento 
            FROM benefactores 
            WHERE LOWER(nombre_benefactor) LIKE LOWER(?) OR LOWER(empresa) LIKE LOWER(?)
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

// 6. OBTENER BENEFACTOR INDIVIDUAL (CON DATOS DE DONACIÓN)
router.get('/detalle/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // A. Datos del Benefactor
        const [benefactor] = await dbPool.query('SELECT * FROM benefactores WHERE id = ?', [id]);
        if (benefactor.length === 0) {
            return res.status(404).json({ mensaje: "Benefactor no encontrado" });
        }

        // B. Datos de la Donación (Traemos la más reciente asociada a este ID)
        const [donacion] = await dbPool.query('SELECT * FROM donaciones WHERE benefactor_id = ? ORDER BY id DESC LIMIT 1', [id]);

        // C. Combinamos ambos objetos en uno solo
        const datosCompletos = { ...benefactor[0], ...(donacion[0] || {}) };

        res.json(datosCompletos);
    } catch (error) {
        console.error("Error al obtener detalle:", error);
        res.status(500).json({ mensaje: "Error al cargar datos completos" });
    }
});

// 7. ACTUALIZAR BENEFACTOR (EDICIÓN INTELIGENTE)
router.put('/editar/:id', async (req, res) => {
    const { id } = req.params;
    const datosEntrantes = req.body;
    const connection = await dbPool.getConnection();

    try {
        await connection.beginTransaction();

        // PASO 1: Obtener los datos ACTUALES de la BD para no perder nada
        const [rowsBenefactor] = await connection.query('SELECT * FROM benefactores WHERE id = ?', [id]);
        
        if (rowsBenefactor.length === 0) {
            throw new Error("Benefactor no encontrado");
        }
        const actualB = rowsBenefactor[0];

        // PASO 2: Preparar datos BENEFACTOR (Mezclando lo nuevo con lo viejo)
        let nuevosTelefonos = JSON.stringify(datosEntrantes.telefonos);
        // Si el array viene vacío o null, mantenemos lo que había en la BD
        if (!datosEntrantes.telefonos || datosEntrantes.telefonos.length === 0) {
            nuevosTelefonos = actualB.numero_contacto;
        }

        let nuevosCorreos = JSON.stringify(datosEntrantes.correos);
        if (!datosEntrantes.correos || datosEntrantes.correos.length === 0) {
            nuevosCorreos = actualB.correo;
        }

        // Construimos el objeto final usando la función auxiliar
        const b = {
            cod_1_tipo: mantenerOActualizar(datosEntrantes.cod_1_tipo, actualB.cod_1_tipo),
            naturaleza: mantenerOActualizar(datosEntrantes.naturaleza, actualB.naturaleza),
            tipo_documento: mantenerOActualizar(datosEntrantes.tipo_documento, actualB.tipo_documento),
            numero_documento: mantenerOActualizar(datosEntrantes.numero_documento, actualB.numero_documento),
            nombre_benefactor: mantenerOActualizar(datosEntrantes.nombre_completo, actualB.nombre_benefactor),
            nombre_contactado: mantenerOActualizar(datosEntrantes.nombre_contactado, actualB.nombre_contactado),
            numero_contacto: nuevosTelefonos, 
            correo: nuevosCorreos,
            fecha_fundacion_o_cumpleanos: mantenerOActualizar(datosEntrantes.fecha_fundacion_o_cumpleanos, actualB.fecha_fundacion_o_cumpleanos),
            direccion: mantenerOActualizar(datosEntrantes.direccion, actualB.direccion),
            departamento: mantenerOActualizar(datosEntrantes.departamento, actualB.departamento),
            ciudad: mantenerOActualizar(datosEntrantes.ciudad, actualB.ciudad),
            empresa: mantenerOActualizar(datosEntrantes.empresa, actualB.empresa),
            cargo: mantenerOActualizar(datosEntrantes.cargo, actualB.cargo),
            estado_civil: mantenerOActualizar(datosEntrantes.estado_civil, actualB.estado_civil),
            conyuge: mantenerOActualizar(datosEntrantes.conyuge, actualB.conyuge),
            protocolo: mantenerOActualizar(datosEntrantes.protocolo, actualB.protocolo),
            contacto_saciar: mantenerOActualizar(datosEntrantes.contacto_saciar, actualB.contacto_saciar),
            estado: mantenerOActualizar(datosEntrantes.estado, actualB.estado),
            autorizacion_datos: mantenerOActualizar(datosEntrantes.autorizacion_datos, actualB.autorizacion_datos),
            fecha_rut_actualizado: mantenerOActualizar(datosEntrantes.fecha_rut_actualizado, actualB.fecha_rut_actualizado),
            certificado_donacion: mantenerOActualizar(datosEntrantes.certificado_donacion, actualB.certificado_donacion),
            certificado_donacion_detalle: mantenerOActualizar(datosEntrantes.certificado_donacion_detalle, actualB.certificado_donacion_detalle),
            fecha_actualizacion_clinton: mantenerOActualizar(datosEntrantes.fecha_actualizacion_clinton, actualB.fecha_actualizacion_clinton),
            antecedentes_judiciales: mantenerOActualizar(datosEntrantes.antecedentes_judiciales, actualB.antecedentes_judiciales),
            encuesta_satisfaccion: mantenerOActualizar(datosEntrantes.encuesta_satisfaccion, actualB.encuesta_satisfaccion),
        };

        // PASO 3: Ejecutar Update BENEFACTOR
        await connection.query(`
            UPDATE benefactores SET
                cod_1_tipo=?, naturaleza=?, tipo_documento=?, numero_documento=?, nombre_benefactor=?,
                nombre_contactado=?, numero_contacto=?, correo=?, fecha_fundacion_o_cumpleanos=?,
                direccion=?, departamento=?, ciudad=?, empresa=?, cargo=?, estado_civil=?, conyuge=?,
                protocolo=?, contacto_saciar=?, estado=?, autorizacion_datos=?, fecha_rut_actualizado=?,
                certificado_donacion=?, certificado_donacion_detalle=?, fecha_actualizacion_clinton=?,
                antecedentes_judiciales=?, encuesta_satisfaccion=?
            WHERE id=?
        `, [
            b.cod_1_tipo, b.naturaleza, b.tipo_documento, b.numero_documento, b.nombre_benefactor,
            b.nombre_contactado, b.numero_contacto, b.correo, b.fecha_fundacion_o_cumpleanos,
            b.direccion, b.departamento, b.ciudad, b.empresa, b.cargo, b.estado_civil, b.conyuge,
            b.protocolo, b.contacto_saciar, b.estado, b.autorizacion_datos, b.fecha_rut_actualizado,
            b.certificado_donacion, b.certificado_donacion_detalle, b.fecha_actualizacion_clinton,
            b.antecedentes_judiciales, b.encuesta_satisfaccion,
            id
        ]);

        // PASO 4: Manejar DONACIONES (Buscar si existe, si no, crearla o ignorar)
        const [rowsDonacion] = await connection.query('SELECT * FROM donaciones WHERE benefactor_id = ? ORDER BY id DESC LIMIT 1', [id]);
        
        if (rowsDonacion.length > 0) {
            // A. SI EXISTE: Actualizamos con lógica de mezcla
            const actualD = rowsDonacion[0];
            const d = {
                tipo_donacion: mantenerOActualizar(datosEntrantes.tipo_donacion, actualD.tipo_donacion),
                procedencia: mantenerOActualizar(datosEntrantes.procedencia, actualD.procedencia),
                procedencia_2: mantenerOActualizar(datosEntrantes.procedencia_2, actualD.procedencia_2),
                detalles_donacion: mantenerOActualizar(datosEntrantes.detalles_donacion, actualD.detalles_donacion),
                fecha_donacion: mantenerOActualizar(datosEntrantes.fecha_donacion, actualD.fecha_donacion),
                observaciones: mantenerOActualizar(datosEntrantes.observaciones, actualD.observaciones),
            };

            await connection.query(`
                UPDATE donaciones SET 
                    tipo_donacion=?, procedencia=?, procedencia_2=?, detalles_donacion=?, fecha_donacion=?, observaciones=?
                WHERE id=?
            `, [d.tipo_donacion, d.procedencia, d.procedencia_2, d.detalles_donacion, d.fecha_donacion, d.observaciones, actualD.id]);

        } else {
            // B. NO EXISTE: ¿Creamos una nueva si vienen datos mínimos?
            // Si el usuario mandó al menos el tipo de donación, asumimos que quiere crearla.
            if (datosEntrantes.tipo_donacion && datosEntrantes.tipo_donacion !== "") {
                await connection.query(`
                    INSERT INTO donaciones (benefactor_id, tipo_donacion, procedencia, procedencia_2, detalles_donacion, fecha_donacion, observaciones)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    id,
                    datosEntrantes.tipo_donacion || 'Desconocido',
                    datosEntrantes.procedencia || 'Desconocido',
                    datosEntrantes.procedencia_2 || '',
                    datosEntrantes.detalles_donacion || '',
                    datosEntrantes.fecha_donacion || null,
                    datosEntrantes.observaciones || ''
                ]);
            }
        }

        await connection.commit();
        res.json({ mensaje: "Datos actualizados (solo se modificaron los campos enviados)" });

    } catch (error) {
        await connection.rollback();
        console.error("Error en actualización inteligente:", error);
        res.status(500).json({ mensaje: "Error al actualizar", error: error.message });
    } finally {
        connection.release();
    }
});

// 8. ELIMINAR BENEFACTOR (Y SUS DONACIONES ASOCIADAS)
router.delete('/eliminar/:id', async (req, res) => {
    const { id } = req.params;
    const connection = await dbPool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Primero borramos las donaciones asociadas (para evitar error de llave foránea)
        await connection.query('DELETE FROM donaciones WHERE benefactor_id = ?', [id]);

        // 2. Luego borramos al benefactor
        const [result] = await connection.query('DELETE FROM benefactores WHERE id = ?', [id]);

        if (result.affectedRows === 0) {
            throw new Error("Benefactor no encontrado");
        }

        await connection.commit();
        res.json({ mensaje: "Benefactor eliminado correctamente" });

    } catch (error) {
        await connection.rollback();
        console.error("Error al eliminar:", error);
        res.status(500).json({ mensaje: "Error al eliminar", error: error.message });
    } finally {
        connection.release();
    }
});

module.exports = router;