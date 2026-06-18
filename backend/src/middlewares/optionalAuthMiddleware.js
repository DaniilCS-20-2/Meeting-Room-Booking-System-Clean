// Мягкая (опциональная) проверка JWT.
// Если заголовка нет — пропускаем как «анонимный пользователь» (req.user = null).
// Если заголовок есть, но токен невалидный/отозван — возвращаем 401:
//   мы не делаем вид, что «всё нормально», потому что клиент явно пытался
//   аутентифицироваться. Иначе анонимные ответы будут казаться залогиненными.
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const HttpError = require("../utils/httpError");
const UserRepository = require("../models/userRepository");

const optionalAuthMiddleware = async (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader) {
    req.user = null;
    return next();
  }
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return next(new HttpError(401, "Missing or invalid Authorization header."));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (_error) {
    return next(new HttpError(401, "Invalid or expired token."));
  }

  try {
    const fresh = await UserRepository.findById(payload.sub);
    if (!fresh) {
      return next(new HttpError(401, "User no longer exists."));
    }
    if (typeof payload.tv !== "number" || payload.tv !== fresh.token_version) {
      return next(new HttpError(401, "Token has been revoked. Please sign in again."));
    }
    req.user = {
      id: payload.sub,
      role: fresh.role,
      email: fresh.email,
      tokenVersion: fresh.token_version,
    };
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = optionalAuthMiddleware;
