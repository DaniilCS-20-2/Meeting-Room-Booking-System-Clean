const crypto = require("crypto");
const BookingRepository = require("../models/bookingRepository");
const RoomRepository = require("../models/roomRepository");
const HttpError = require("../utils/httpError");
const {
  isValidDate,
  getDurationMinutes,
  generateWeeklyOccurrences,
} = require("../utils/time");

// Создаём сервис бизнес-логики бронирований.
class BookingService {
  static MAX_RECURRING_OCCURRENCES = 366;
  static MAX_RECURRING_SPAN_DAYS = 366;

  static validateBaseSlot(startDateTime, endDateTime) {
    const startTime = new Date(startDateTime);
    const endTime = new Date(endDateTime);

    if (!isValidDate(startTime) || !isValidDate(endTime)) {
      throw new HttpError(400, "Invalid startDateTime or endDateTime.");
    }

    if (startTime < new Date()) {
      throw new HttpError(400, "Cannot create bookings in the past.");
    }

    const durationMinutes = getDurationMinutes(startTime, endTime);
    if (durationMinutes < 1) {
      throw new HttpError(400, "End time must be after start time.");
    }

    return { startTime, endTime, durationMinutes };
  }

  static validateDurationLimits(durationMinutes, room) {
    const min = room.min_booking_minutes;
    const max = room.max_booking_minutes;
    if (min != null && durationMinutes < min) {
      throw new HttpError(400, `Booking must be at least ${min} minutes for this room.`);
    }
    if (max != null && durationMinutes > max) {
      throw new HttpError(400, `Booking cannot exceed ${max} minutes for this room.`);
    }
  }

  // Валидируем параметры recurring и генерируем вхождения.
  static buildOccurrences({ startTime, endTime, recurring }) {
    // Если recurring не указан, возвращаем единственный слот.
    if (!recurring) {
      // Возвращаем массив для унификации дальнейшей обработки.
      return [{ startTime, endTime, recurrenceGroupId: null }];
    }

    // Проверяем, что дни недели переданы массивом.
    if (!Array.isArray(recurring.weekdays) || recurring.weekdays.length === 0) {
      // Требуем минимум один день недели.
      throw new HttpError(400, "Recurring weekdays must be a non-empty array.");
    }

    // Проверяем корректность диапазона дней недели (0=Sunday ... 6=Saturday).
    const hasInvalidWeekday = recurring.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6);
    // Бросаем ошибку при невалидных значениях.
    if (hasInvalidWeekday) {
      throw new HttpError(400, "Recurring weekdays must contain integers from 0 to 6.");
    }

    // Преобразуем дату окончания серии.
    const untilDate = new Date(recurring.untilDate);
    // Проверяем валидность untilDate.
    if (!isValidDate(untilDate)) {
      // Ошибка формата даты окончания.
      throw new HttpError(400, "Recurring untilDate is invalid.");
    }

    // Дата окончания серии не может быть раньше первого слота.
    if (untilDate.getTime() < startTime.getTime()) {
      // Запрещаем обратный диапазон.
      throw new HttpError(400, "Recurring untilDate must be equal or after the first booking date.");
    }
    const spanDays = Math.ceil((untilDate.getTime() - startTime.getTime()) / (24 * 60 * 60 * 1000));
    if (spanDays > BookingService.MAX_RECURRING_SPAN_DAYS) {
      throw new HttpError(
        400,
        `Recurring series is too long (max ${BookingService.MAX_RECURRING_SPAN_DAYS} days).`
      );
    }

    // Генерируем идентификатор группы recurring-бронирований.
    const recurrenceGroupId = crypto.randomUUID();
    // Создаём список вхождений на основе дней недели и границы untilDate.
    const generated = generateWeeklyOccurrences({
      startTime,
      endTime,
      weekdays: recurring.weekdays,
      untilDate,
    });

    // Если по шаблону не сгенерировано ни одного слота, это ошибка входных данных.
    if (generated.length === 0) {
      throw new HttpError(400, "Recurring rule produced zero occurrences.");
    }
    if (generated.length > BookingService.MAX_RECURRING_OCCURRENCES) {
      throw new HttpError(
        400,
        `Recurring series is too large (max ${BookingService.MAX_RECURRING_OCCURRENCES} occurrences).`
      );
    }

    // Добавляем идентификатор группы к каждому вхождению серии.
    return generated.map((occurrence) => ({
      ...occurrence,
      recurrenceGroupId,
    }));
  }

  static async createBooking({
    userId,
    roomId,
    startDateTime,
    endDateTime,
    recurring,
    comment,
    guestFirstName,
    guestLastName,
    guestDescription,
  }) {
    if (!userId || !roomId) {
      throw new HttpError(400, "userId and roomId are required.");
    }

    const room = await RoomRepository.findById(roomId);
    if (!room) throw new HttpError(404, "Room not found.");
    if (room.is_disabled) {
      throw new HttpError(409, room.disabled_reason || "Room is currently unavailable.");
    }

    const { startTime, endTime, durationMinutes } = BookingService.validateBaseSlot(startDateTime, endDateTime);
    BookingService.validateDurationLimits(durationMinutes, room);

    const occurrences = BookingService.buildOccurrences({ startTime, endTime, recurring });

    // Выполняем все вставки в одной транзакции.
    return BookingRepository.withTransaction(async (client) => {
      // Инициализируем массив созданных бронирований и список пропущенных (конфликтных).
      const createdBookings = [];
      const skippedOccurrences = [];

      // Последовательно создаём каждое вхождение.
      for (const occurrence of occurrences) {
        // Проверяем конфликт перед вставкой.
        const hasConflict = await BookingRepository.hasTimeConflict(
          client,
          roomId,
          occurrence.startTime,
          occurrence.endTime
        );

        // Если конфликт найден — пропускаем этот день, но продолжаем с остальными.
        if (hasConflict) {
          skippedOccurrences.push({
            startTime: occurrence.startTime,
            endTime: occurrence.endTime,
            reason: "time conflict",
          });
          continue;
        }

        // Вставляем бронирование в БД.
        const inserted = await BookingRepository.insertBooking(client, {
          roomId,
          userId,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
          recurrenceGroupId: occurrence.recurrenceGroupId,
          comment,
          guestFirstName,
          guestLastName,
          guestDescription,
          status: "confirmed",
        });

        // Сохраняем созданную запись в итоговый массив.
        createdBookings.push(inserted);
      }

      // Если не создано ни одной брони (все дни были заняты) — считаем это ошибкой.
      if (createdBookings.length === 0) {
        throw new HttpError(409, "All selected time slots are already booked.");
      }

      // Возвращаем результат создания одной/нескольких записей + информацию о пропущенных.
      return {
        totalCreated: createdBookings.length,
        totalSkipped: skippedOccurrences.length,
        recurrenceGroupId: createdBookings[0]?.recurrence_group_id || null,
        bookings: createdBookings,
        skipped: skippedOccurrences,
      };
    }).catch((error) => {
      // Если ошибка пришла из PostgreSQL по исключающему ограничению, конвертируем в 409.
      if (error && error.constraint === "exclude_room_overlapping_bookings") {
        throw new HttpError(409, "Selected room is already booked for this time slot.");
      }
      // Иначе пробрасываем исходную ошибку.
      throw error;
    });
  }

  // Редактирование брони:
  // - всегда можно менять end_time (если соблюдены ограничения);
  // - опционально можно «превратить» одиночную бронь в recurring-серию.
  static async updateBookingEndTime({
    bookingId,
    requesterId,
    requesterRole,
    newStartDateTime = null,
    newEndDateTime,
    comment = null,
    hasComment = false,
    recurring = null,
  }) {
    if (!bookingId) throw new HttpError(400, "bookingId is required.");
    if (!newEndDateTime) throw new HttpError(400, "endDateTime is required.");

    const booking = await BookingRepository.findById(bookingId);
    if (!booking) throw new HttpError(404, "Booking not found.");

    if (booking.status !== "pending" && booking.status !== "confirmed") {
      throw new HttpError(400, "Cannot edit a cancelled booking.");
    }

    const isOwner = booking.user_id === requesterId;
    const isAdmin = requesterRole === "admin";
    if (!isOwner && !isAdmin) {
      throw new HttpError(403, "You can only edit your own bookings.");
    }

    const start = newStartDateTime ? new Date(newStartDateTime) : new Date(booking.start_time);
    const newEnd = new Date(newEndDateTime);
    if (!isValidDate(start)) {
      throw new HttpError(400, "Invalid startDateTime.");
    }
    if (!isValidDate(newEnd)) {
      throw new HttpError(400, "Invalid endDateTime.");
    }
    if (newStartDateTime && start < new Date()) {
      throw new HttpError(400, "Cannot set booking start time in the past.");
    }

    if (newEnd <= start) {
      throw new HttpError(400, "New end time must be after the start time.");
    }
    if (newEnd <= new Date()) {
      throw new HttpError(400, "Cannot set booking end time in the past.");
    }

    const room = await RoomRepository.findById(booking.room_id);
    if (room?.is_disabled) {
      throw new HttpError(409, room.disabled_reason || "Room is currently unavailable.");
    }
    if (room) {
      const newDuration = getDurationMinutes(start, newEnd);
      if (room.min_booking_minutes != null && newDuration < room.min_booking_minutes) {
        throw new HttpError(
          400,
          `Booking must be at least ${room.min_booking_minutes} minutes for this room.`
        );
      }
      if (room.max_booking_minutes != null && newDuration > room.max_booking_minutes) {
        throw new HttpError(
          400,
          `Booking cannot exceed ${room.max_booking_minutes} minutes for this room.`
        );
      }
    }

    const recurringRequested = recurring != null;
    if (recurringRequested && booking.recurrence_group_id) {
      throw new HttpError(400, "Booking is already part of a recurring series.");
    }

    return BookingRepository.withTransaction(async (client) => {
      // Проверяем пересечение с другими бронями этой комнаты.
      const hasConflict = await BookingRepository.hasTimeConflictExcludingBooking(
        client,
        booking.room_id,
        start,
        newEnd,
        bookingId
      );
      if (hasConflict) {
        throw new HttpError(409, "Selected room is already booked for this time slot.");
      }

      const nextComment = hasComment ? (comment || null) : (booking.comment || null);
      let updated = await BookingRepository.updateEditableFields(
        bookingId,
        { startTime: start, endTime: newEnd, comment: nextComment },
        client
      );
      if (!updated) throw new HttpError(409, "Booking could not be updated.");

      // Если recurring не передан — обычное редактирование одной записи.
      if (!recurringRequested) {
        return updated;
      }

      // Генерируем вхождения серии по обновлённому интервалу текущей записи.
      const generated = BookingService.buildOccurrences({
        startTime: start,
        endTime: newEnd,
        recurring,
      });

      const recurrenceGroupId = crypto.randomUUID();
      updated = await BookingRepository.updateRecurrenceGroup(updated.id, recurrenceGroupId, client);
      if (!updated) throw new HttpError(409, "Booking could not be updated.");

      // Первая точка — сама редактируемая запись; добавляем только будущие.
      const futureOccurrences = generated.filter(
        (occurrence) => occurrence.startTime.getTime() > start.getTime()
      );

      const createdBookings = [];
      const skippedOccurrences = [];
      for (const occurrence of futureOccurrences) {
        const hasSeriesConflict = await BookingRepository.hasTimeConflict(
          client,
          booking.room_id,
          occurrence.startTime,
          occurrence.endTime
        );
        if (hasSeriesConflict) {
          skippedOccurrences.push({
            startTime: occurrence.startTime,
            endTime: occurrence.endTime,
            reason: "time conflict",
          });
          continue;
        }

        const inserted = await BookingRepository.insertBooking(client, {
          roomId: booking.room_id,
          userId: booking.user_id,
          startTime: occurrence.startTime,
          endTime: occurrence.endTime,
          recurrenceGroupId,
          comment: nextComment,
          guestFirstName: booking.guest_first_name,
          guestLastName: booking.guest_last_name,
          guestDescription: booking.guest_description,
          status: booking.status,
        });
        createdBookings.push(inserted);
      }

      return {
        ...updated,
        recurrence_total_created: createdBookings.length,
        recurrence_total_skipped: skippedOccurrences.length,
      };
    }).catch((error) => {
      if (error && error.constraint === "exclude_room_overlapping_bookings") {
        throw new HttpError(409, "Selected room is already booked for this time slot.");
      }
      throw error;
    });
  }

  // Отмена всей будущей серии recurring-бронирований.
  // Доступно владельцу серии и админу. Прошедшие вхождения не трогаем,
  // чтобы не ломать историю.
  static async cancelSeries({ bookingId, requesterId, requesterRole }) {
    const booking = await BookingRepository.findById(bookingId);
    if (!booking) throw new HttpError(404, "Booking not found.");
    if (!booking.recurrence_group_id) {
      throw new HttpError(400, "Booking is not part of a recurring series.");
    }

    const isOwner = booking.user_id === requesterId;
    const isAdmin = requesterRole === "admin";
    if (!isOwner && !isAdmin) {
      throw new HttpError(403, "You can only cancel your own series.");
    }

    const fromTime = new Date();
    return BookingRepository.cancelFutureSeries(booking.recurrence_group_id, fromTime);
  }
}

// Экспортируем сервис для использования в контроллерах.
module.exports = BookingService;
