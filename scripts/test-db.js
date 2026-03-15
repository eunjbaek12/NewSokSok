const { Pool } = require('pg');
require('dotenv').config();

async function checkConnection() {
    console.log("Checking DB connection...");
    console.log("URL:", process.env.DATABASE_URL ? "Exists" : "MISSING");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000
    });

    try {
        const client = await pool.connect();
        console.log("Successfully connected to DB");
        const res = await client.query('SELECT NOW()');
        console.log("Query result:", res.rows[0]);
        client.release();
    } catch (err) {
        console.error("Connection failed:", err.message);
    } finally {
        await pool.end();
    }
}

checkConnection();
