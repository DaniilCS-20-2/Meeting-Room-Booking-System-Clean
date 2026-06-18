// Репозиторий одноразовых кодов верификации.
// Хранит только SHA-256 хеш от кода, считает попытки и умеет временно
// блокировать пару (user_id, purpose) после нескольких неверных вводов.
const crypto = require("crypto");
const pool = require("../db/pool");

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const hashCode = (code) =>
  crypto.createHash("sha256").update(String(code)).digest("hex");

class VerificationCodeRepository {
  // Создаём (или перезаписываем) код для пары (user_id, purpose).
  // payload — произвольные метаданные (например, новый email при email_change).
  static async upsert({ userId, purpose, code, payload = null, ttlMinutes = 15 }) {
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const { rows } = await pool.query(
      `INSERT INTO verification_codes (user_id, purpose, code_hash, payload, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (user_id, purpose)
       DO UPDATE SET code_hash    = EXCLUDED.code_hash,
                     payload      = EXCLUDED.payload,
                     attempts     = 0,
                     locked_until = NULL,
                     expires_at   = EXCLUDED.expires_at,
                     created_at   = NOW()
       RETURNING id`,
      [userId, purpose, codeHash, payload ? JSON.stringify(payload) : null, expiresAt]
    );
    return rows[0];
  }

  // Находим активный код для пары.
  static async findActive(userId, purpose) {
    const { rows } = await pool.query(
      `SELECT id, user_id, purpose, code_hash, payload, attempts, locked_until, expires_at
       FROM verification_codes
       WHERE user_id = $1 AND purpose = $2
       LIMIT 1`,
      [userId, purpose]
    );
    return rows[0] || null;
  }

  // Фиксируем неудачную попытку и, при превышении лимита, блокируем.
  static async registerFailedAttempt(id) {
    const { rows } = await pool.query(
      `UPDATE verification_codes
       SET attempts     = attempts + 1,
           locked_until = CASE
               WHEN attempts + 1 >= $2 THEN NOW() + ($3 || ' minutes')::interval
               ELSE locked_until
           END
       WHERE id = $1
       RETURNING attempts, locked_until`,
      [id, MAX_ATTEMPTS, String(LOCK_MINUTES)]
    );
    return rows[0] || null;
  }

  // Код считается «совпавшим» — удаляем его сразу, чтобы нельзя было использовать повторно.
  static async consume(id) {
    await pool.query(`DELETE FROM verification_codes WHERE id = $1`, [id]);
  }

  // Атомарное «поглощение» кода: удаляем запись только при совпадении хеша.
  // Нужен для защиты от гонки между verify() и consume().
  static async consumeVerified(id, code) {
    const { rowCount } = await pool.query(
      `DELETE FROM verification_codes
       WHERE id = $1 AND code_hash = $2`,
      [id, hashCode(code)]
    );
    return rowCount > 0;
  }

  // Вспомогалка: сверяем код, инкрементит попытки на ошибке.
  // Возвращает { ok: true, row } либо { ok: false, reason }.
  static async verify(userId, purpose, code) {
    const row = await this.findActive(userId, purpose);
    if (!row) return { ok: false, reason: "not_found" };
    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      return { ok: false, reason: "locked", row };
    }
    if (new Date() > new Date(row.expires_at)) {
      return { ok: false, reason: "expired", row };
    }
    if (row.code_hash !== hashCode(code)) {
      const updated = await this.registerFailedAttempt(row.id);
      return { ok: false, reason: "mismatch", attempts: updated?.attempts || 0 };
    }
    return { ok: true, row };
  }

  static hashCode = hashCode;
  static MAX_ATTEMPTS = MAX_ATTEMPTS;
}

module.exports = VerificationCodeRepository;
