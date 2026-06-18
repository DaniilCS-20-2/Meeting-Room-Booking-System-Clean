const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const UserRepository = require("../models/userRepository");
const WhitelistRepository = require("../models/whitelistRepository");
const CompanyRepository = require("../models/companyRepository");
const PendingRegistrationRepository = require("../models/pendingRegistrationRepository");
const VerificationCodeRepository = require("../models/verificationCodeRepository");
const HttpError = require("../utils/httpError");
const { sendVerificationCode } = require("../utils/mailer");

// Генерирует JWT для пользователя. Добавляем tv (token_version) — если
// пользователь сменит пароль/почту, старые токены станут невалидны.
// Срок жизни — 30 дней («запомни меня»), при смене пароля/почты tv всё равно
// мгновенно инвалидирует все старые токены.
const signUserToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      tv: user.token_version ?? 1,
    },
    env.jwtSecret,
    { expiresIn: "30d" }
  );

// 6-значный код для отправки на почту.
const generateCode = () => String(crypto.randomInt(100000, 1000000));

class AuthService {
  static async register({ email, password, displayName, companyId }) {
    if (!email || !password) {
      throw new HttpError(400, "Email and password are required.");
    }

    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      throw new HttpError(409, "User with this email already exists.");
    }

    const whitelisted = await WhitelistRepository.findByEmail(email);
    if (!whitelisted) {
      throw new HttpError(403, "E-posten er ikkje godkjend for registrering.");
    }

    // Проверяем компанию: если компании существуют — выбор обязателен.
    let resolvedCompanyId = null;
    const companies = await CompanyRepository.findAll();
    if (companies.length > 0) {
      if (!companyId) {
        throw new HttpError(400, "Vel eit selskap.");
      }
      const company = companies.find((c) => c.id === companyId);
      if (!company) {
        throw new HttpError(400, "Ugyldig selskap.");
      }
      resolvedCompanyId = company.id;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const code = generateCode();

    await PendingRegistrationRepository.upsert({
      email,
      displayName: displayName || "",
      passwordHash,
      role: whitelisted.role,
      companyId: resolvedCompanyId,
      code,
      ttlMinutes: 15,
    });

    await sendVerificationCode(email, code);

    const pendingToken = jwt.sign(
      { email: String(email).toLowerCase(), type: "pending_registration" },
      env.jwtSecret,
      { expiresIn: "15m" }
    );

    return { pendingToken, verificationRequired: true };
  }

  static async verifyEmail({ pendingToken, code }) {
    let payload;
    try {
      payload = jwt.verify(pendingToken, env.jwtSecret);
    } catch {
      throw new HttpError(400, "Invalid or expired token.");
    }
    if (payload.type !== "pending_registration") {
      throw new HttpError(400, "Invalid token type.");
    }

    const emailKey = payload.email;
    const verification = await PendingRegistrationRepository.verify(emailKey, code);
    if (!verification.ok) {
      if (verification.reason === "not_found") {
        throw new HttpError(400, "No pending registration found. Please register again.");
      }
      if (verification.reason === "locked") {
        throw new HttpError(429, "For mange forsøk. Prøv igjen om 15 min.");
      }
      if (verification.reason === "expired") {
        await PendingRegistrationRepository.remove(emailKey);
        throw new HttpError(400, "Verification code expired. Please register again.");
      }
      throw new HttpError(400, "Invalid verification code.");
    }

    const pending = verification.row;

    const existingAgain = await UserRepository.findByEmail(pending.email);
    if (existingAgain) {
      await PendingRegistrationRepository.remove(emailKey);
      throw new HttpError(409, "User with this email already exists.");
    }

    const whitelisted = await WhitelistRepository.findByEmail(pending.email);
    if (!whitelisted) {
      await PendingRegistrationRepository.remove(emailKey);
      throw new HttpError(403, "E-posten er ikkje godkjend for registrering.");
    }
    const role = pending.role || whitelisted.role;
    const user = await UserRepository.createUser({
      email: pending.email,
      displayName: pending.display_name,
      passwordHash: pending.password_hash,
      role,
      companyId: pending.company_id || null,
    });
    await UserRepository.confirmEmail(user.id);
    await PendingRegistrationRepository.remove(emailKey);

    // Перечитываем пользователя, чтобы взять актуальный token_version и роль.
    const fresh = await UserRepository.findById(user.id);
    const token = signUserToken(fresh);

    return { user: fresh, token, verified: true };
  }

  // Выполняем логин пользователя по email и паролю.
  static async login({ email, password }) {
    // Проверяем обязательные поля.
    if (!email || !password) {
      throw new HttpError(400, "Email and password are required.");
    }
    // Ищем пользователя по email.
    const user = await UserRepository.findByEmail(email);
    // Если не найден — возвращаем обезличенную ошибку 401.
    if (!user) throw new HttpError(401, "Invalid credentials.");

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new HttpError(401, "Invalid credentials.");

    if (!user.email_verified) {
      throw new HttpError(403, "Email not verified. Please register again.");
    }

    const token = signUserToken(user);

    // Возвращаем публичные данные пользователя и токен.
    return {
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        avatar_url: user.avatar_url,
        email_verified: user.email_verified,
      },
      token,
    };
  }

  static async forgotPassword({ email }) {
    if (!email) {
      throw new HttpError(400, "Email is required.");
    }
    const user = await UserRepository.findByEmail(email);
    // Обезличенный ответ — не даём перебирать существующие почты.
    if (!user) {
      return { codeSent: true };
    }

    const code = generateCode();
    await VerificationCodeRepository.upsert({
      userId: user.id,
      purpose: "password_reset",
      code,
      ttlMinutes: 15,
    });
    await sendVerificationCode(user.email, code);

    return { codeSent: true };
  }

  static async resetPassword({ email, code, newPassword }) {
    if (!email || !code || !newPassword) {
      throw new HttpError(400, "Email, code and new password are required.");
    }
    if (String(newPassword).length < 6) {
      throw new HttpError(400, "Password must be at least 6 characters.");
    }
    const user = await UserRepository.findByEmail(email);
    if (!user) throw new HttpError(400, "Invalid verification code.");

    const result = await VerificationCodeRepository.verify(user.id, "password_reset", code);
    if (!result.ok) {
      if (result.reason === "locked") {
        throw new HttpError(429, "For mange forsøk. Prøv igjen seinare.");
      }
      if (result.reason === "expired") {
        throw new HttpError(400, "Verification code expired.");
      }
      throw new HttpError(400, "Invalid verification code.");
    }

    const consumed = await VerificationCodeRepository.consumeVerified(result.row.id, code);
    if (!consumed) {
      throw new HttpError(400, "Invalid verification code.");
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await UserRepository.updatePassword(user.id, hash);
    await UserRepository.confirmEmail(user.id);
    // Сбрасываем все ранее выданные JWT.
    await UserRepository.bumpTokenVersion(user.id);

    return { reset: true };
  }

  static async me(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw new HttpError(404, "User not found.");
    if (!user.email_verified) {
      throw new HttpError(403, "Email not verified.");
    }
    return user;
  }
}

// Экспортируем сервис аутентификации для контроллеров.
module.exports = AuthService;
