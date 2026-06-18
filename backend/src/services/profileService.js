const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const UserRepository = require("../models/userRepository");
const WhitelistRepository = require("../models/whitelistRepository");
const VerificationCodeRepository = require("../models/verificationCodeRepository");
const HttpError = require("../utils/httpError");
const { sendVerificationCode } = require("../utils/mailer");

const generateCode = () => String(crypto.randomInt(100000, 1000000));

class ProfileService {
  static async updateProfile(userId, { displayName, avatarUrl }) {
    const user = await UserRepository.updateProfile(userId, { displayName, avatarUrl });
    if (!user) throw new HttpError(404, "User not found.");
    return user;
  }

  static async requestPasswordChange(userId, { currentPassword, newPassword }) {
    if (!currentPassword || !newPassword) {
      throw new HttpError(400, "Current and new password are required.");
    }
    const userBasic = await UserRepository.findById(userId);
    const user = userBasic ? await UserRepository.findByEmail(userBasic.email) : null;
    if (!user) throw new HttpError(404, "User not found.");

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new HttpError(400, "Current password is incorrect.");

    const code = generateCode();
    await VerificationCodeRepository.upsert({
      userId: user.id,
      purpose: "password_change",
      code,
      ttlMinutes: 15,
    });
    await sendVerificationCode(user.email, code);

    return { codeSent: true };
  }

  static async confirmPasswordChange(userId, { code, newPassword }) {
    if (!code || !newPassword) {
      throw new HttpError(400, "Code and new password are required.");
    }
    const result = await VerificationCodeRepository.verify(userId, "password_change", code);
    if (!result.ok) {
      if (result.reason === "locked") throw new HttpError(429, "For mange forsøk. Prøv igjen seinare.");
      if (result.reason === "expired") throw new HttpError(400, "Verification code expired.");
      throw new HttpError(400, "Invalid verification code.");
    }

    const consumed = await VerificationCodeRepository.consumeVerified(result.row.id, code);
    if (!consumed) {
      throw new HttpError(400, "Invalid verification code.");
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await UserRepository.updatePassword(userId, hash);
    await UserRepository.confirmEmail(userId);
    await UserRepository.bumpTokenVersion(userId);

    return { changed: true };
  }

  static async requestEmailChange(userId, { newEmail, password }) {
    if (!newEmail || !password) {
      throw new HttpError(400, "New email and password are required.");
    }
    const userBasic = await UserRepository.findById(userId);
    const user = userBasic ? await UserRepository.findByEmail(userBasic.email) : null;
    if (!user) throw new HttpError(404, "User not found.");

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new HttpError(400, "Password is incorrect.");

    const existing = await UserRepository.findByEmail(newEmail);
    if (existing) throw new HttpError(409, "Email already in use.");
    const whitelisted = await WhitelistRepository.findByEmail(newEmail);
    if (!whitelisted) {
      throw new HttpError(403, "E-posten er ikkje godkjend for registrering.");
    }

    const code = generateCode();
    // Храним новый email в payload кода, не в колонках users — чтобы его
    // нельзя было подделать при confirm.
    await VerificationCodeRepository.upsert({
      userId: user.id,
      purpose: "email_change",
      code,
      payload: { newEmail: String(newEmail).toLowerCase() },
      ttlMinutes: 15,
    });
    await sendVerificationCode(newEmail, code);

    return { codeSent: true };
  }

  static async confirmEmailChange(userId, { code, newEmail }) {
    if (!code || !newEmail) {
      throw new HttpError(400, "Code and new email are required.");
    }
    const result = await VerificationCodeRepository.verify(userId, "email_change", code);
    if (!result.ok) {
      if (result.reason === "locked") throw new HttpError(429, "For mange forsøk. Prøv igjen seinare.");
      if (result.reason === "expired") throw new HttpError(400, "Verification code expired.");
      throw new HttpError(400, "Invalid verification code.");
    }
    const payloadEmail = result.row.payload?.newEmail;
    if (!payloadEmail || payloadEmail !== String(newEmail).toLowerCase()) {
      throw new HttpError(400, "Email mismatch.");
    }
    const whitelisted = await WhitelistRepository.findByEmail(payloadEmail);
    if (!whitelisted) {
      throw new HttpError(403, "E-posten er ikkje godkjend for registrering.");
    }

    const consumed = await VerificationCodeRepository.consumeVerified(result.row.id, code);
    if (!consumed) {
      throw new HttpError(400, "Invalid verification code.");
    }

    const updated = await UserRepository.updateEmail(userId, payloadEmail);
    await UserRepository.bumpTokenVersion(userId);
    return { changed: true, email: updated.email };
  }
}

module.exports = ProfileService;
