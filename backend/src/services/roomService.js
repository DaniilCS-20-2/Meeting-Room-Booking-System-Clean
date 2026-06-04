// Импортируем репозиторий комнат для доступа к данным.
const RoomRepository = require("../models/roomRepository");
// Импортируем репозиторий бронирований для вычисления статуса занятости.
const BookingRepository = require("../models/bookingRepository");
// Импортируем типизированную HTTP-ошибку.
const HttpError = require("../utils/httpError");

// Создаём сервис бизнес-логики комнат.
class RoomService {
  // Получаем все комнаты с динамически вычисленным статусом (ledig / opptatt).
  static async getAllRooms({ isAdmin = false } = {}) {
    // Загружаем список комнат; для админа включаем и отключённые.
    const rooms = await RoomRepository.findAll({ includeDisabled: isAdmin });
    // Фиксируем текущее время для проверки занятости.
    const now = new Date();

    // Для каждой комнаты обогащаем данные: вычисляем актуальный статус.
    const enriched = await Promise.all(
      rooms.map(async (room) => {
        // Если комната отключена админом — статус «vedlikehald», без ближайшего события.
        if (room.is_disabled) {
          return { ...room, computed_status: "vedlikehald", nearest_event: null };
        }
        // Ищем активные бронирования, перекрывающие текущий момент.
        const bookings = await BookingRepository.findByRoom(room.id, {
          from: now.toISOString(),
          to: now.toISOString(),
        });
        // Если есть бронирование прямо сейчас — комната занята.
        const isBusy = bookings.length > 0;
        // Загружаем будущие бронирования для вычисления ближайшего события.
        const upcoming = await BookingRepository.findByRoom(room.id, {
          from: now.toISOString(),
        });
        // Инициализируем переменную ближайшего события.
        let nearestEvent = null;
        if (isBusy) {
          // Комната занята — ищем текущее бронирование и показываем когда освободится.
          const current = upcoming.find(
            (b) => new Date(b.start_time) <= now && new Date(b.end_time) > now
          );
          // Если нашли текущее бронирование — время окончания = когда освободится.
          if (current) {
            nearestEvent = { type: "free_at", time: current.end_time };
          }
        } else {
          // Комната свободна — ищем ближайшее будущее бронирование.
          const next = upcoming.find((b) => new Date(b.start_time) > now);
          // Если есть будущее бронирование — показываем когда будет занята.
          if (next) {
            nearestEvent = { type: "busy_at", time: next.start_time };
          }
        }
        // Возвращаем комнату с дополнительными вычисленными полями.
        return {
          ...room,
          computed_status: isBusy ? "opptatt" : "ledig",
          nearest_event: nearestEvent,
        };
      })
    );
    // Возвращаем обогащённый массив комнат.
    return enriched;
  }

  // Получаем одну комнату по UUID идентификатору.
  static async getRoomById(id) {
    // Запрашиваем комнату из репозитория.
    const room = await RoomRepository.findById(id);
    // Если комната не найдена — возвращаем 404.
    if (!room) throw new HttpError(404, "Room not found.");
    // Возвращаем данные комнаты.
    return room;
  }

  // Создаём новую комнату (вызывается админом).
  static async createRoom(payload) {
    // Проверяем обязательные поля: имя и вместимость.
    if (!payload.name || !payload.capacity) {
      throw new HttpError(400, "Name and capacity are required.");
    }
    // Создаём комнату через репозиторий и возвращаем результат.
    return RoomRepository.create(payload);
  }

  // Обновляем данные комнаты (вызывается админом).
  static async updateRoom(id, payload) {
    // Обновляем комнату через репозиторий.
    const room = await RoomRepository.update(id, payload);
    // Если комната не найдена — возвращаем 404.
    if (!room) throw new HttpError(404, "Room not found.");
    // Возвращаем обновлённую комнату.
    return room;
  }

  // Удаляем комнату (вызывается админом).
  static async deleteRoom(id) {
    // Удаляем комнату через репозиторий.
    const deleted = await RoomRepository.deleteRoom(id);
    // Если комната не найдена — возвращаем 404.
    if (!deleted) throw new HttpError(404, "Room not found.");
    // Возвращаем подтверждение удаления.
    return { deleted: true };
  }

  // Переключаем временное отключение комнаты (вызывается админом).
  static async toggleDisabled(id, isDisabled, reason = "") {
    if (typeof isDisabled !== "boolean") {
      throw new HttpError(400, "isDisabled must be boolean.");
    }
    const cleanReason = String(reason || "").trim();
    if (isDisabled && !cleanReason) {
      throw new HttpError(400, "Reason is required when disabling a room.");
    }
    // Переключаем флаг через репозиторий.
    const room = await RoomRepository.toggleDisabled(id, isDisabled, { reason: cleanReason });
    // Если комната не найдена — возвращаем 404.
    if (!room) throw new HttpError(404, "Room not found.");
    // Возвращаем обновлённую комнату.
    return room;
  }
}

// Экспортируем сервис комнат для контроллеров.
module.exports = RoomService;
