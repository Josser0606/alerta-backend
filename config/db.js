const mysql = require('mysql2');
require('dotenv').config();

const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { 
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    }
}).promise();

console.log("--- Intentando conectar a Base de Datos... ---");

module.exports = dbPool;