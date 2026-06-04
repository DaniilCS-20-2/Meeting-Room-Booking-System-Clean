// Централизованные zod-схемы для валидации входящих запросов.
// Ограничиваем длину строк, формат email/UUID/HEX-цвета и запрещаем лишние поля.
const { z } = require("zod");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("ugyldig e-post");

const uuidField = z.string().uuid("ikkje gyldig id");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "fargen må vera HEX (#RRGGBB)");
const sixDigitCode = z.string().regex(/^\d{4,10}$/, "ugyldig kode");

// Пустые поля приводим к null, чтобы контроллерам было удобнее.
const optionalStr = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional();

// ============ Auth ============
const registerSchema = z
  .object({
    email: emailField,
    password: z.string().min(1).max(200),
    displayName: z.string().trim().max(100).optional().default(""),
    companyId: z.union([uuidField, z.literal(""), z.null()]).optional(),
  })
  .strict();

const loginSchema = z
  .object({
    email: emailField,
    password: z.string().min(1).max(200),
  })
  .strict();

const verifySchema = z
  .object({
    pendingToken: z.string().min(10).max(2000),
    code: sixDigitCode,
  })
  .strict();

const forgotPasswordSchema = z
  .object({ email: emailField })
  .strict();

const resetPasswordSchema = z
  .object({
    email: emailField,
    code: sixDigitCode,
    newPassword: z.string().min(1).max(200),
  })
  .strict();

// ============ Profile ============
const updateProfileSchema = z
  .object({
    displayName: z.string().trim().max(100).optional(),
    avatarUrl: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const requestPasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(1).max(200),
  })
  .strict();

const confirmPasswordChangeSchema = z
  .object({
    code: sixDigitCode,
    newPassword: z.string().min(1).max(200),
  })
  .strict();

const requestEmailChangeSchema = z
  .object({
    newEmail: emailField,
    password: z.string().min(1).max(200),
  })
  .strict();

const confirmEmailChangeSchema = z
  .object({
    code: sixDigitCode,
    newEmail: emailField,
  })
  .strict();

// ============ Admin ============
const adminUpdateUserSchema = z
  .object({
    displayName: z.string().trim().max(100).optional(),
    avatarUrl: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const adminUpdateUserCompanySchema = z
  .object({
    companyId: z.union([uuidField, z.literal(""), z.null()]),
  })
  .strict();

const whitelistAddSchema = z
  .object({
    email: emailField,
    role: z.enum(["user", "admin", "viewer"]).default("user"),
  })
  .strict();

const whitelistUpdateSchema = z
  .object({ role: z.enum(["user", "admin", "viewer"]) })
  .strict();

const companyCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    color: hexColor,
  })
  .strict();

const companyUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    color: hexColor.optional(),
  })
  .strict();

// ============ Bookings ============
// Фронт шлёт startDateTime/endDateTime как ISO-строки из <input type=datetime-local>.
// recurring: пустой объект/null = одиночная бронь; иначе weekdays + untilDate
// генерируют серию (см. BookingService.buildOccurrences).
const recurringSchema = z
  .object({
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    untilDate: z.string().min(5).max(40),
  })
  .strict();

const createBookingSchema = z
  .object({
    roomId: uuidField,
    startDateTime: z.string().min(5).max(40),
    endDateTime: z.string().min(5).max(40),
    comment: optionalStr(500),
    guestFirstName: optionalStr(300),
    guestLastName: optionalStr(100),
    guestDescription: optionalStr(500),
    recurring: recurringSchema.optional().nullable(),
  })
  .strict();

// PATCH /api/bookings/:id — редактирование окончания (укорачивать/удлинять).
// Передаём только endDateTime, а бизнес-правила валидирует сервис.
const updateBookingSchema = z
  .object({
    endDateTime: z.string().min(5).max(40),
  })
  .strict();

// ============ Comments ============
const commentCreateSchema = z
  .object({
    message: z.string().trim().min(1).max(1000),
  })
  .strict();

// ============ Rooms (admin) ============
// payload прилетает из фронта в camelCase и мапится на snake_case внутри репозитория.
const roomCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    capacity: z.number().int().min(1).max(1000).optional(),
    minBookingMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
    maxBookingMinutes: z.number().int().min(1).max(31 * 24 * 60).nullable().optional(),
    photoUrl: z.string().trim().max(500).nullable().optional(),
    equipment: z.string().trim().max(2000).nullable().optional(),
    isDisabled: z.boolean().optional(),
    // HEX-цвет комнаты для общего календаря (или null чтобы сбросить на дефолт-хэш).
    color: z.union([hexColor, z.literal(""), z.null()]).optional(),
  })
  .strict();

module.exports = {
  registerSchema,
  loginSchema,
  verifySchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  requestPasswordChangeSchema,
  confirmPasswordChangeSchema,
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
  adminUpdateUserSchema,
  adminUpdateUserCompanySchema,
  whitelistAddSchema,
  whitelistUpdateSchema,
  companyCreateSchema,
  companyUpdateSchema,
  createBookingSchema,
  updateBookingSchema,
  commentCreateSchema,
  roomCreateSchema,
};
