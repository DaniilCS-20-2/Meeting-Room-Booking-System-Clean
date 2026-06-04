// Импортируем репозиторий пользователей для доступа к данным.
const UserRepository = require("../models/userRepository");
const WhitelistRepository = require("../models/whitelistRepository");
const CompanyRepository = require("../models/companyRepository");
const BookingRepository = require("../models/bookingRepository");
const { notifyBookingCancelled } = require("../utils/bookingNotifications");
// Импортируем типизированную HTTP-ошибку.
const HttpError = require("../utils/httpError");

// Контроллер получения списка всех пользователей (только для админа).
const getAllUsers = async (_req, res, next) => {
  try {
    // Получаем всех пользователей из репозитория.
    const users = await UserRepository.findAll();
    // Возвращаем 200 с массивом пользователей.
    res.json({ success: true, data: users });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер редактирования пользователя админом (только имя и аватар).
const updateUser = async (req, res, next) => {
  try {
    // Обновляем пользователя по id из параметров URL.
    const user = await UserRepository.adminUpdate(req.params.id, {
      displayName: req.body.displayName,
      avatarUrl: req.body.avatarUrl,
    });
    // Если пользователь не найден — 404.
    if (!user) throw new HttpError(404, "User not found.");
    // Возвращаем 200 с обновлёнными данными.
    res.json({ success: true, data: user });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

// Контроллер удаления пользователя (только для админа).
const deleteUser = async (req, res, next) => {
  try {
    // Удаляем пользователя по id.
    const deleted = await UserRepository.deleteUser(req.params.id);
    // Если пользователь не найден — 404.
    if (!deleted) throw new HttpError(404, "User not found.");
    // Возвращаем 200 с подтверждением удаления.
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    // Передаём ошибку в глобальный обработчик.
    next(err);
  }
};

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));

// Список допустимых ролей. Любое неизвестное значение из тела запроса
// падает обратно на 'user' — безопасный дефолт.
const ROLES = ["user", "admin", "viewer"];
const normalizeRole = (raw) => (ROLES.includes(raw) ? raw : "user");

const getWhitelist = async (_req, res, next) => {
  try {
    const items = await WhitelistRepository.findAll();
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

const addWhitelist = async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim();
    const role = normalizeRole(req.body.role);
    if (!isValidEmail(email)) {
      throw new HttpError(400, "Ugyldig e-postadresse.");
    }
    const item = await WhitelistRepository.create({ email, role });
    // Если пользователь уже зарегистрирован — синхронизируем его роль и
    // инкрементим token_version, чтобы старая JWT-сессия (со старой ролью)
    // тут же стала недействительной — никаких «остаточных прав».
    const updatedUser = await UserRepository.updateRoleByEmail(item.email, item.role);
    if (updatedUser) await UserRepository.bumpTokenVersion(updatedUser.id);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

const updateWhitelistRole = async (req, res, next) => {
  try {
    const role = normalizeRole(req.body.role);
    const item = await WhitelistRepository.updateRole(req.params.id, role);
    if (!item) throw new HttpError(404, "Whitelist entry not found.");
    const updatedUser = await UserRepository.updateRoleByEmail(item.email, item.role);
    if (updatedUser) await UserRepository.bumpTokenVersion(updatedUser.id);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

const deleteWhitelist = async (req, res, next) => {
  try {
    const deleted = await WhitelistRepository.remove(req.params.id);
    if (!deleted) throw new HttpError(404, "Whitelist entry not found.");
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
};

// Меняем компанию пользователя (админ). companyId = null очищает привязку.
const updateUserCompany = async (req, res, next) => {
  try {
    const raw = req.body.companyId;
    const companyId = raw === null || raw === "" || raw === undefined ? null : String(raw);
    if (companyId) {
      const exists = await CompanyRepository.findById(companyId);
      if (!exists) throw new HttpError(404, "Selskap ikkje funne.");
    }
    const user = await UserRepository.updateCompany(req.params.id, companyId);
    if (!user) throw new HttpError(404, "User not found.");
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// Админ загружает аватар для произвольного пользователя.
const uploadUserAvatar = async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, "No file uploaded.");
    const avatarUrl = `/uploads/${req.file.filename}`;
    const user = await UserRepository.adminUpdate(req.params.id, { avatarUrl });
    if (!user) throw new HttpError(404, "User not found.");
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

// Жёстко удаляем одно бронирование из истории (админ).
const deleteBooking = async (req, res, next) => {
  try {
    const booking = await BookingRepository.findById(req.params.id);
    if (!booking) throw new HttpError(404, "Booking not found.");
    const ok = await BookingRepository.hardDelete(req.params.id);
    if (!ok) throw new HttpError(404, "Booking not found.");
    notifyBookingCancelled(booking);
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
};

// Очищаем историю комнаты — удаляем прошедшие и отменённые бронирования.
// Активные будущие брони намеренно не трогаем.
const clearRoomHistory = async (req, res, next) => {
  try {
    const deleted = await BookingRepository.clearRoomHistory(req.params.roomId);
    res.json({ success: true, data: { deleted } });
  } catch (err) {
    next(err);
  }
};

// Экспортируем контроллеры администрирования.
module.exports = {
  getAllUsers,
  updateUser,
  updateUserCompany,
  deleteUser,
  getWhitelist,
  addWhitelist,
  updateWhitelistRole,
  deleteWhitelist,
  deleteBooking,
  clearRoomHistory,
  uploadUserAvatar,
};
