// Импортируем пул подключений к PostgreSQL.
const pool = require("../db/pool");

// Создаём репозиторий комнат для инкапсуляции SQL-запросов.
class RoomRepository {
  // Получаем все комнаты из базы данных.
  static async findAll({ includeDisabled = false } = {}) {
    // Если включён флаг includeDisabled, показываем и отключённые комнаты (для админа).
    const where = includeDisabled ? "" : "WHERE is_disabled = FALSE";
    // Формируем SELECT-запрос со всеми полями комнаты.
    const { rows } = await pool.query(
      `SELECT id, name, location, capacity, description, equipment, photo_url, photos, color,
              min_booking_minutes, max_booking_minutes, status, is_disabled, disabled_reason,
              created_at, updated_at
       FROM rooms ${where}
       ORDER BY name ASC`
    );
    // Возвращаем массив комнат, отсортированный по имени.
    return rows;
  }

  // Получаем одну комнату по UUID идентификатору.
  static async findById(id) {
    // Формируем SELECT-запрос по первичному ключу.
    const { rows } = await pool.query(
      `SELECT id, name, location, capacity, description, equipment, photo_url, photos, color,
              min_booking_minutes, max_booking_minutes, status, is_disabled, disabled_reason,
              created_at, updated_at
       FROM rooms WHERE id = $1`,
      [id]
    );
    // Возвращаем комнату или null, если не найдена.
    return rows[0] || null;
  }

  // Создаём новую комнату в базе данных (вызывается админом).
  static async create(payload) {
    // Формируем параметризованный INSERT-запрос.
    const { rows } = await pool.query(
      `INSERT INTO rooms (name, location, capacity, description, equipment, photo_url,
                          min_booking_minutes, max_booking_minutes, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        payload.name,
        payload.location || "",
        payload.capacity,
        payload.description || null,
        payload.equipment || null,
        payload.photoUrl || null,
        payload.minBookingMinutes || 15,
        payload.maxBookingMinutes || 480,
        // HEX-цвет комнаты (для общего календаря); NULL = «не задан».
        payload.color || null,
      ]
    );
    // Возвращаем созданную запись.
    return rows[0];
  }

  static async update(id, payload) {
    const minVal = payload.minBookingMinutes === undefined ? undefined : payload.minBookingMinutes;
    const maxVal = payload.maxBookingMinutes === undefined ? undefined : payload.maxBookingMinutes;

    // color обрабатываем отдельно, чтобы можно было ОЧИСТИТЬ (передать null).
    // Флаг $13 = «нужно ли вообще трогать color», иначе COALESCE-логика
    // не отличала бы «не передал» от «явно стереть в NULL».
    const colorProvided = Object.prototype.hasOwnProperty.call(payload, "color");

    const { rows } = await pool.query(
      `UPDATE rooms SET
         name                = COALESCE($2, name),
         location            = COALESCE($3, location),
         capacity            = COALESCE($4, capacity),
         description         = COALESCE($5, description),
         equipment           = COALESCE($6, equipment),
         photo_url           = COALESCE($7, photo_url),
         min_booking_minutes = CASE WHEN $10::boolean THEN $8::integer ELSE min_booking_minutes END,
         max_booking_minutes = CASE WHEN $11::boolean THEN $9::integer ELSE max_booking_minutes END,
         color               = CASE WHEN $13::boolean THEN $12 ELSE color END,
         updated_at          = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        payload.name,
        payload.location,
        payload.capacity,
        payload.description,
        payload.equipment,
        payload.photoUrl,
        minVal !== undefined ? minVal : null,
        maxVal !== undefined ? maxVal : null,
        minVal !== undefined,
        maxVal !== undefined,
        colorProvided ? (payload.color || null) : null,
        colorProvided,
      ]
    );
    return rows[0] || null;
  }

  // Удаляем комнату из базы (вызывается админом).
  static async deleteRoom(id) {
    // Выполняем DELETE и проверяем количество затронутых строк.
    const { rowCount } = await pool.query(`DELETE FROM rooms WHERE id = $1`, [id]);
    // Возвращаем true, если комната была удалена.
    return rowCount > 0;
  }

  static async addPhoto(id, photoUrl) {
    const { rows } = await pool.query(
      `UPDATE rooms SET photos = photos || $2::jsonb, photo_url = COALESCE(photo_url, $3), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, JSON.stringify([photoUrl]), photoUrl]
    );
    return rows[0] || null;
  }

  static async removePhoto(id, photoUrl) {
    const room = await this.findById(id);
    if (!room) return null;
    const photos = (room.photos || []).filter((p) => p !== photoUrl);
    const newCover = photos[0] || null;
    const { rows } = await pool.query(
      `UPDATE rooms SET photos = $2::jsonb, photo_url = $3, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, JSON.stringify(photos), newCover]
    );
    return rows[0] || null;
  }

  static async toggleDisabled(id, isDisabled, payload = {}) {
    // Если комната отключается, меняем статус на «vedlikehald» (обслуживание).
    const status = isDisabled ? "vedlikehald" : "ledig";
    // Обновляем флаг is_disabled и статус комнаты.
    const { rows } = await pool.query(
      `UPDATE rooms SET is_disabled = $2, status = $3, disabled_reason = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id, isDisabled, status, isDisabled ? (payload.reason || null) : null]
    );
    // Возвращаем обновлённую комнату или null.
    return rows[0] || null;
  }
}

// Экспортируем репозиторий комнат для сервисного слоя.
module.exports = RoomRepository;
