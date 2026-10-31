
const mysql = require("mysql2/promise");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, "../.env")
});

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || "APP",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  enableKeepAlive: true,
  multipleStatements: false
});

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
