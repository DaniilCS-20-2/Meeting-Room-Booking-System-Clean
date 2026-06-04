const pool = require("../db/pool");

// Допустимый формат HEX-цвета '#RRGGBB' (строчные/заглавные).
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

class CompanyRepository {
  static isValidColor(color) {
    return typeof color === "string" && HEX_RE.test(color);
  }

  static async findAll() {
    const { rows } = await pool.query(
      `SELECT id, name, color, logo_url, created_at
       FROM companies
       ORDER BY name ASC`
    );
    return rows;
  }

  static async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, name, color, logo_url, created_at FROM companies WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  static async create({ name, color }) {
    const { rows } = await pool.query(
      `INSERT INTO companies (name, color)
       VALUES ($1, $2)
       RETURNING id, name, color, logo_url, created_at`,
      [name, color]
    );
    return rows[0];
  }

  static async setLogo(id, logoUrl) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: oldRows } = await client.query(
        `SELECT id, name FROM companies WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const previous = oldRows[0];
      if (!previous) {
        await client.query("ROLLBACK");
        return null;
      }

      const { rows } = await client.query(
        `UPDATE companies
         SET logo_url = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, color, logo_url, created_at`,
        [id, logoUrl]
      );
      const updated = rows[0];

      await client.query(
        `UPDATE bookings
         SET company_logo_snapshot = $2
         WHERE company_name_snapshot = $1`,
        [previous.name, logoUrl]
      );

      await client.query("COMMIT");
      return updated;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async update(id, { name, color }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: oldRows } = await client.query(
        `SELECT id, name, color FROM companies WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const previous = oldRows[0];
      if (!previous) {
        await client.query("ROLLBACK");
        return null;
      }

      const { rows } = await client.query(
        `UPDATE companies
         SET name  = COALESCE($2, name),
             color = COALESCE($3, color),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, color, logo_url, created_at`,
        [id, name ?? null, color ?? null]
      );
      const updated = rows[0];

      await client.query(
        `UPDATE bookings
         SET company_name_snapshot = $2,
             company_color_snapshot = $3
         WHERE company_name_snapshot = $1`,
        [previous.name, updated.name, updated.color]
      );

      await client.query("COMMIT");
      return updated;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  static async remove(id) {
    const { rowCount } = await pool.query(
      `DELETE FROM companies WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  }
}

module.exports = CompanyRepository;
