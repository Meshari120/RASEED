
"use strict";

const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");

/* تحميل متغيرات البيئة من جذر المشروع */
dotenv.config({
    path: path.join(__dirname, ".env")
});

/* التحقق من بيانات الاتصال */
const requiredVariables = [
    "DB_HOST",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD"
];

const missingVariables = requiredVariables.filter(
    (variable) => !process.env[variable]
);

if (missingVariables.length > 0) {
    throw new Error(
        `Missing database environment variables: ${missingVariables.join(", ")}`
    );
}

/* إعداد اتصال MySQL */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,

    enableKeepAlive: true,
    multipleStatements: false,
    connectTimeout: 15000
});

/* اختبار الاتصال بقاعدة البيانات */
async function testDatabase() {
    const connection = await pool.getConnection();

    try {
        const [rows] = await connection.execute(
            "SELECT DATABASE() AS databaseName"
        );

        if (!rows[0] || !rows[0].databaseName) {
            throw new Error("Database selection failed");
        }

        console.log("MySQL connection successful.");
        console.log("Database selected:", rows[0].databaseName);

    } finally {
        connection.release();
    }
}

module.exports = {
    pool,
    testDatabase
};
