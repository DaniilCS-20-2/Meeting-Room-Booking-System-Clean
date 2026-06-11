// Импортируем пул подключений к PostgreSQL.
const pool = require("../db/pool");

// Создаём репозиторий пользователей для инкапсуляции SQL-запросов.
class UserRepository {
  // Ищем пользователя по email без учёта регистра.
  static async findByEmail(email) {
    // Формируем SQL-запрос с LOWER() для case-insensitive поиска.
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.password_hash, u.role, u.avatar_url,
              u.email_verified, u.verification_code, u.verification_expires_at, u.created_at,
              u.token_version,
              u.company_id, c.name AS company_name, c.color AS company_color
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE LOWER(u.email) = LOWER($1) LIMIT 1`,
      [email]
    );
    // Возвращаем найденного пользователя или null, если не найден.
    return rows[0] || null;
  }

  // Ищем пользователя по UUID идентификатору.
  static async findById(id) {
    // Формируем SQL-запрос по первичному ключу.
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.avatar_url, u.email_verified, u.created_at,
              u.token_version,
              u.company_id, c.name AS company_name, c.color AS company_color
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       WHERE u.id = $1`,
      [id]
    );
    // Возвращаем пользователя или null.
    return rows[0] || null;
  }

  // Инкрементим token_version — инвалидирует все выданные ранее JWT.
  static async bumpTokenVersion(id) {
    const { rows } = await pool.query(
      `UPDATE users SET token_version = token_version + 1, updated_at = NOW()
       WHERE id = $1 RETURNING token_version`,
      [id]
    );
    return rows[0]?.token_version ?? null;
  }

  // Создаём нового пользователя в таблице users.
  static async createUser({ email, displayName, passwordHash, role = "user", companyId = null }) {
    // Формируем параметризованный INSERT-запрос.
    const { rows } = await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role, company_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, role, avatar_url, email_verified, created_at, company_id`,
      [email, displayName || "", passwordHash, role, companyId]
    );
    // Возвращаем созданную запись пользователя.
    return rows[0];
  }

  // Обновляем профиль пользователя (имя и/или аватар).
  static async updateProfile(id, { displayName, avatarUrl }) {
    // COALESCE сохраняет старое значение, если новое не передано (null).
    const { rows } = await pool.query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           avatar_url   = COALESCE($3, avatar_url),
           updated_at   = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, role, avatar_url, email_verified, created_at`,
      [id, displayName, avatarUrl]
    );
    // Возвращаем обновлённого пользователя или null, если id не найден.
    return rows[0] || null;
  }

  // Обновляем хеш пароля пользователя.
  static async updatePassword(id, passwordHash) {
    // Формируем UPDATE-запрос только для поля password_hash.
    await pool.query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [id, passwordHash]
    );
  }

  // Сохраняем код верификации email и время его истечения.
  static async setVerificationCode(id, code, expiresAt) {
    // Обновляем два поля, связанных с верификацией.
    await pool.query(
      `UPDATE users
       SET verification_code = $2, verification_expires_at = $3, updated_at = NOW()
       WHERE id = $1`,
      [id, code, expiresAt]
    );
  }

  // Подтверждаем email пользователя после успешной верификации.
  static async confirmEmail(id) {
    // Устанавливаем флаг email_verified и очищаем код верификации.
    await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           verification_code = NULL,
           verification_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  // Получаем список всех пользователей (используется админом).
  static async findAll() {
    // Формируем SELECT-запрос с сортировкой по дате создания.
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.role, u.avatar_url, u.email_verified, u.created_at,
              u.company_id, c.name AS company_name, c.color AS company_color
       FROM users u
       LEFT JOIN companies c ON c.id = u.company_id
       ORDER BY u.created_at DESC`
    );
    // Возвращаем массив всех пользователей.
    return rows;
  }

  // Админ обновляет данные пользователя (только имя и аватар).
  static async adminUpdate(id, { displayName, avatarUrl }) {
    // COALESCE предотвращает затирание значения при null.
    const { rowCount } = await pool.query(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           avatar_url   = COALESCE($3, avatar_url),
           updated_at   = NOW()
       WHERE id = $1`,
      [id, displayName, avatarUrl]
    );
    if (!rowCount) return null;
    // С JOIN на companies — иначе в админке «пропадает» компания в UI.
    return this.findById(id);
  }

  // Админ меняет компанию пользователя; companyId === null очищает привязку.
  static async updateCompany(id, companyId) {
    const { rows } = await pool.query(
      `UPDATE users SET company_id = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, display_name, role, avatar_url, email_verified, created_at, company_id`,
      [id, companyId]
    );
    if (!rows[0]) return null;
    // Подгружаем имя и цвет привязанной компании для ответа.
    return this.findById(id);
  }

  static async updateEmail(id, newEmail) {
    const { rows } = await pool.query(
      `UPDATE users SET email = $2, email_verified = TRUE,
       verification_code = NULL, verification_expires_at = NULL,
       updated_at = NOW() WHERE id = $1
       RETURNING id, email, display_name, role, avatar_url, email_verified, created_at`,
      [id, newEmail]
    );
    return rows[0] || null;
  }

  // Обновляем роль пользователя по email (используется при изменении whitelist).
  static async updateRoleByEmail(email, role) {
    const { rows } = await pool.query(
      `UPDATE users SET role = $2, updated_at = NOW()
       WHERE LOWER(email) = LOWER($1)
       RETURNING id, email, display_name, role, avatar_url, email_verified, created_at`,
      [email, role]
    );
    return rows[0] || null;
  }

  static async deleteUser(id) {
    // Выполняем DELETE-запрос и проверяем количество затронутых строк.
    const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    // Возвращаем true, если пользователь был удалён.
    return rowCount > 0;
  }
}

// Экспортируем репозиторий для использования в сервисах.
module.exports = UserRepository;
