// Импортируем сервис комнат для делегирования бизнес-логики.
const RoomService = require("../services/roomService");

// Контроллер получения списка всех комнат с вычисленным статусом.
const getAll = async (req, res, next) => {
  try {
    // Определяем, является ли пользователь админом (для показа отключённых комнат).
    const isAdmin = req.user?.role === "admin";
    // Получаем обогащённый список комнат из сервиса.
    const rooms = await RoomService.getAllRooms({ isAdmin });
    // Возвращаем 200 со списком комнат.
    res.json({ success: true, data: rooms });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер получения одной комнаты по id.
const getById = async (req, res, next) => {
  try {
    // Получаем комнату по id из параметров URL.
    const room = await RoomService.getRoomById(req.params.id);
    // Возвращаем 200 с данными комнаты.
    res.json({ success: true, data: room });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер создания новой комнаты (только для админа).
const create = async (req, res, next) => {
  try {
    // Создаём комнату через сервис, передавая тело запроса.
    const room = await RoomService.createRoom(req.body);
    // Возвращаем 201 Created с данными созданной комнаты.
    res.status(201).json({ success: true, data: room });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер обновления данных комнаты (только для админа).
const update = async (req, res, next) => {
  try {
    // Обновляем комнату по id из URL и данными из тела запроса.
    const room = await RoomService.updateRoom(req.params.id, req.body);
    // Возвращаем 200 с обновлёнными данными.
    res.json({ success: true, data: room });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер удаления комнаты (только для админа).
const remove = async (req, res, next) => {
  try {
    // Удаляем комнату по id.
    const result = await RoomService.deleteRoom(req.params.id);
    // Возвращаем 200 с подтверждением удаления.
    res.json({ success: true, data: result });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер переключения временного отключения комнаты (только для админа).
const toggleDisabled = async (req, res, next) => {
  try {
    // Переключаем флаг отключения по id и значению из тела запроса.
    const room = await RoomService.toggleDisabled(req.params.id, req.body.isDisabled, req.body.reason);
    // Возвращаем 200 с обновлёнными данными комнаты.
    res.json({ success: true, data: room });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

const RoomRepository = require("../models/roomRepository");

const uploadPhoto = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });
    const photoUrl = `/uploads/${req.file.filename}`;
    const room = await RoomRepository.addPhoto(req.params.id, photoUrl);
    res.json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
};

const deletePhoto = async (req, res, next) => {
  try {
    const { photoUrl } = req.body;
    if (!photoUrl) return res.status(400).json({ success: false, message: "photoUrl required." });
    const room = await RoomRepository.removePhoto(req.params.id, photoUrl);
    res.json({ success: true, data: room });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAll, getById, create, update, remove, toggleDisabled, uploadPhoto, deletePhoto };
