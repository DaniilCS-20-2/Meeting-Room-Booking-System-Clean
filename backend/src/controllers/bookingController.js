const BookingService = require("../services/bookingService");
const BookingRepository = require("../models/bookingRepository");
const HttpError = require("../utils/httpError");
const {
  notifyBookingCreated,
  notifyBookingUpdated,
  notifyBookingCancelled,
  notifySeriesCancelled,
} = require("../utils/bookingNotifications");

// Контроллер создания бронирования (одиночного или recurring).
const createBooking = async (req, res, next) => {
  try {
    // Извлекаем id пользователя из контекста authMiddleware.
    // Передаём данные из тела запроса в сервис создания.
    const result = await BookingService.createBooking({
      userId: req.user.id,
      roomId: req.body.roomId,
      startDateTime: req.body.startDateTime,
      endDateTime: req.body.endDateTime,
      recurring: req.body.recurring,
      comment: req.body.comment,
      guestFirstName: req.body.guestFirstName,
      guestLastName: req.body.guestLastName,
      guestDescription: req.body.guestDescription,
    });
    notifyBookingCreated({
      userId: req.user.id,
      userEmail: req.user.email,
      roomId: req.body.roomId,
      bookings: result.bookings,
    });
    // Возвращаем 201 Created с данными созданных бронирований.
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер получения бронирований по комнате (для календаря).
// Доступен анонимам и viewer'ам, но из ответа вырезаются персональные поля
// (имя, селскап, цвет, описание) — наружу торчит только факт занятости.
const getByRoom = async (req, res, next) => {
  try {
    // Извлекаем параметры фильтрации из query string.
    const { from, to } = req.query;
    const bookings = await BookingRepository.findByRoom(req.params.roomId, { from, to });

    const role = req.user?.role;
    const isPrivileged = role === "user" || role === "admin";
    if (!isPrivileged) {
      // Анонимы и viewer видят только время и статус — никаких имён.
      const scrubbed = bookings.map((b) => ({
        id: b.id,
        room_id: b.room_id,
        start_time: b.start_time,
        end_time: b.end_time,
        status: b.status,
      }));
      return res.json({ success: true, data: scrubbed });
    }

    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
};

// GET /api/bookings — бронирования всех комнат в диапазоне (для общего календаря).
// Публично (через optionalAuth), но persona-поля скрываются для anon/viewer.
const getAllInRange = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const bookings = await BookingRepository.findAllInRange({ from, to });
    const role = req.user?.role;
    const isPrivileged = role === "user" || role === "admin";
    if (!isPrivileged) {
      const scrubbed = bookings.map((b) => ({
        id: b.id,
        room_id: b.room_id,
        room_name: b.room_name,
        room_color: b.room_color,
        start_time: b.start_time,
        end_time: b.end_time,
        status: b.status,
      }));
      return res.json({ success: true, data: scrubbed });
    }
    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
};

// Контроллер получения полной истории бронирований комнаты (все статусы).
const getHistoryByRoom = async (req, res, next) => {
  try {
    // Получаем все бронирования включая отменённые.
    const bookings = await BookingRepository.findHistoryByRoom(req.params.roomId);
    // Возвращаем 200 с массивом истории.
    res.json({ success: true, data: bookings });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер получения бронирований текущего пользователя.
const getMy = async (req, res, next) => {
  try {
    // Получаем бронирования по id текущего пользователя из токена.
    const bookings = await BookingRepository.findByUser(req.user.id);
    // Возвращаем 200 с массивом бронирований.
    res.json({ success: true, data: bookings });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер отмены бронирования.
const cancel = async (req, res, next) => {
  try {
    // Ищем бронирование по id.
    const booking = await BookingRepository.findById(req.params.id);
    // Если бронирование не найдено — 404.
    if (!booking) throw new HttpError(404, "Booking not found.");
    if (new Date(booking.end_time) < new Date()) {
      throw new HttpError(400, "Cannot cancel past bookings.");
    }
    if (req.user.role !== "admin" && booking.user_id !== req.user.id) {
      throw new HttpError(403, "You can only cancel your own bookings.");
    }
    const cancelled = await BookingRepository.cancel(req.params.id);
    if (!cancelled) throw new HttpError(400, "Booking already cancelled.");

    notifyBookingCancelled(booking);

    res.json({ success: true, data: cancelled });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// PATCH /api/bookings/:id — редактирование времени окончания.
const updateBooking = async (req, res, next) => {
  try {
    const bookingBefore = await BookingRepository.findById(req.params.id);
    const updated = await BookingService.updateBookingEndTime({
      bookingId: req.params.id,
      requesterId: req.user.id,
      requesterRole: req.user.role,
      newEndDateTime: req.body.endDateTime,
    });
    notifyBookingUpdated(bookingBefore, updated);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/bookings/:id/series — отмена всей будущей серии recurring-бронирований.
const cancelSeries = async (req, res, next) => {
  try {
    const booking = await BookingRepository.findById(req.params.id);
    const result = await BookingService.cancelSeries({
      bookingId: req.params.id,
      requesterId: req.user.id,
      requesterRole: req.user.role,
    });
    notifySeriesCancelled(booking, result.count);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// Экспортируем все контроллеры бронирований.
module.exports = {
  createBooking,
  getByRoom,
  getHistoryByRoom,
  getMy,
  cancel,
  updateBooking,
  cancelSeries,
  getAllInRange,
};
