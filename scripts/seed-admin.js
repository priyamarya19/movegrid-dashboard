const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

const pool = new Pool({
  host: process.env.RDS_HOST,
  port: Number(process.env.RDS_PORT) || 5432,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  database: process.env.RDS_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const schema = process.env.RDS_ENV === "uat" ? "uat_auth" : "auth";

async function seed() {
  try {
    // Create admin role if not exists
    await pool.query(`
      INSERT INTO ${schema}.roles (name, description)
      VALUES ('admin', 'Full access')
      ON CONFLICT (name) DO NOTHING
    `);

    const roleResult = await pool.query(`SELECT id FROM ${schema}.roles WHERE name = 'admin'`);
    const roleId = roleResult.rows[0].id;

    const passwordHash = await bcrypt.hash("password", 10);

    await pool.query(`
      INSERT INTO ${schema}.users (name, email, mobile, password_hash, role_id, status)
      VALUES ('Priyam', 'priyam@movegrid.in', '9639350154', $1, $2, 'active')
      ON CONFLICT (email) DO UPDATE SET password_hash = $1, role_id = $2, status = 'active'
    `, [passwordHash, roleId]);

    console.log("✓ Admin user created: priyam@movegrid.in / password");
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

seed();
