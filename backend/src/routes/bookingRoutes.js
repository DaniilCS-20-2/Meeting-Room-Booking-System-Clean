// Импортируем Router из Express.
const express = require("express");
// Импортируем контроллер бронирований.
const bookingController = require("../controllers/bookingController");
// Импортируем middleware проверки JWT-токена.
const authMiddleware = require("../middlewares/authMiddleware");
const optionalAuthMiddleware = require("../middlewares/optionalAuthMiddleware");
const rbacMiddleware = require("../middlewares/rbacMiddleware");
const { validateBody } = require("../middlewares/validateMiddleware");
const { createBookingSchema, updateBookingSchema } = require("../validators/schemas");

// Создаём экземпляр роутера для маршрутов бронирований.
const router = express.Router();

// Разрешённые роли «писать в календарь» — обычный юзер и админ.
// Viewer (read-only) от записи отрезан жёстко на уровне роутера.
const writers = rbacMiddleware(["user", "admin"]);

// POST   /api/bookings — создание бронирования (одиночного или recurring).
router.post("/", authMiddleware, writers, validateBody(createBookingSchema), bookingController.createBooking);
// GET    /api/bookings — общий календарь по всем комнатам (публично, скрабленные поля для anon/viewer).
router.get("/", optionalAuthMiddleware, bookingController.getAllInRange);
// GET    /api/bookings/my — бронирования текущего пользователя.
router.get("/my", authMiddleware, bookingController.getMy);
// GET    /api/bookings/room/:roomId — публично (анонимы видят занятость без имён).
router.get("/room/:roomId", optionalAuthMiddleware, bookingController.getByRoom);
// GET    /api/bookings/room/:roomId/history — полная история. Только для авторизованных.
router.get("/room/:roomId/history", authMiddleware, writers, bookingController.getHistoryByRoom);
// PATCH  /api/bookings/:id/cancel — отмена бронирования (своё или любое для админа).
router.patch("/:id/cancel", authMiddleware, writers, bookingController.cancel);
// PATCH  /api/bookings/:id — изменение времени окончания (своё или любое для админа).
router.patch("/:id", authMiddleware, writers, validateBody(updateBookingSchema), bookingController.updateBooking);
// DELETE /api/bookings/:id/series — отмена всей будущей recurring-серии.
router.delete("/:id/series", authMiddleware, writers, bookingController.cancelSeries);

// Экспортируем роутер бронирований.
module.exports = router;
