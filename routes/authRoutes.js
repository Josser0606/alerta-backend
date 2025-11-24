const express = require('express');
const router = express.Router();
const dbPool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// 1. Registro
router.post('/register', async (req, res) => {
    try {
        const { email, password, nombre_completo, rol } = req.body;
        if (!email || !password || !rol) {
            return res.status(400).json({ mensaje: "Faltan datos." });
        }
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        
        await dbPool.query(
            "INSERT INTO usuarios (email, password_hash, nombre_completo, rol) VALUES (?, ?, ?, ?)", 
            [email, password_hash, nombre_completo, rol]
        );
        res.status(201).json({ mensaje: `Usuario ${email} registrado.` });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ mensaje: "Email ya registrado." });
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

// 2. Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [usuarios] = await dbPool.query("SELECT * FROM usuarios WHERE email = ?", [email]);
        const usuario = usuarios[0];
        
        if (!usuario) return res.status(400).json({ mensaje: "Credenciales incorrectas." });
        
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) return res.status(400).json({ mensaje: "Credenciales incorrectas." });
        
        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, rol: usuario.rol }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1d' } 
        );
        res.json({
            mensaje: "Login exitoso",
            token: token,
            usuario: { nombre: usuario.nombre_completo, rol: usuario.rol }
        });
    } catch (error) {
        res.status(500).json({ mensaje: "Error servidor" });
    }
});

module.exports = router;