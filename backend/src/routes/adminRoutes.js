// Импортируем Router из Express.
const express = require("express");
// Импортируем контроллер администрирования пользователей.
const adminController = require("../controllers/adminController");
const companyController = require("../controllers/companyController");
// Импортируем middleware проверки JWT-токена.
const authMiddleware = require("../middlewares/authMiddleware");
// Импортируем middleware проверки ролей (RBAC).
const rbacMiddleware = require("../middlewares/rbacMiddleware");
const { validateBody } = require("../middlewares/validateMiddleware");
const { processImage } = require("../middlewares/imageUploadMiddleware");
const {
  adminUpdateUserSchema, adminUpdateUserCompanySchema,
  whitelistAddSchema, whitelistUpdateSchema,
  companyCreateSchema, companyUpdateSchema,
} = require("../validators/schemas");

// Создаём экземпляр роутера для админских маршрутов.
const router = express.Router();

// Все админские маршруты требуют auth + роль admin.
router.use(authMiddleware, rbacMiddleware(["admin"]));

// GET    /api/admin/users — список всех пользователей (только админ).
router.get("/users", adminController.getAllUsers);
// PUT    /api/admin/users/:id — редактирование пользователя (только имя и аватар).
router.put("/users/:id", validateBody(adminUpdateUserSchema), adminController.updateUser);
// PUT    /api/admin/users/:id/company — смена компании пользователя.
router.put("/users/:id/company", validateBody(adminUpdateUserCompanySchema), adminController.updateUserCompany);
// POST   /api/admin/users/:id/avatar — загрузка нового аватара пользователя (через жёсткий пайплайн).
router.post("/users/:id/avatar",
  ...processImage({ fieldName: "avatar", prefix: "avatar", maxSide: 512, quality: 85 }),
  adminController.uploadUserAvatar);
// DELETE /api/admin/users/:id — удаление пользователя.
router.delete("/users/:id", adminController.deleteUser);

// Управление компаниями (selskap) — только админ.
router.get("/companies", companyController.getAll);
router.post("/companies", validateBody(companyCreateSchema), companyController.create);
router.put("/companies/:id", validateBody(companyUpdateSchema), companyController.update);
router.post("/companies/:id/logo",
  ...processImage({ fieldName: "logo", prefix: "company", maxSide: 320, quality: 90, preferPng: true }),
  companyController.uploadLogo);
router.delete("/companies/:id", companyController.remove);

// Управление историей бронирований — только админ.
router.delete("/bookings/:id", adminController.deleteBooking);
router.delete("/rooms/:roomId/history", adminController.clearRoomHistory);

// Whitelist е-постов: только админ.
router.get("/whitelist", adminController.getWhitelist);
router.post("/whitelist", validateBody(whitelistAddSchema), adminController.addWhitelist);
router.put("/whitelist/:id", validateBody(whitelistUpdateSchema), adminController.updateWhitelistRole);
router.delete("/whitelist/:id", adminController.deleteWhitelist);

// Экспортируем роутер администрирования.
module.exports = router;
