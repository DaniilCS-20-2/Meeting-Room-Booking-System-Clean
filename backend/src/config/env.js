// Загружаем переменные окружения из .env файла.
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

// JWT секрет обязателен. В production запрещаем слабый/дефолтный секрет,
// иначе любой сможет подделать токены.
const rawJwtSecret = process.env.JWT_SECRET || "";
if (isProd) {
  if (!rawJwtSecret || rawJwtSecret.length < 32 || rawJwtSecret === "change-me-in-production") {
    throw new Error(
      "JWT_SECRET is required in production and must be at least 32 characters long."
    );
  }
} else if (!rawJwtSecret) {
  // В dev даём безопасный fallback, но кричим в консоль, чтобы точно заметили.
  // eslint-disable-next-line no-console
  console.warn(
    "[env] JWT_SECRET is not set. Using insecure dev fallback — DO NOT deploy as is."
  );
}

// Список разрешённых origin'ов для CORS. Формат: "https://a.com,https://b.com".
// По умолчанию разрешаем только frontendUrl (или локальный dev).
const azureHost = process.env.WEBSITE_HOSTNAME;
const defaultFrontendUrl = azureHost ? `https://${azureHost}` : "http://localhost:5173";
const frontendUrl = process.env.FRONTEND_URL || defaultFrontendUrl;
const extraOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([frontendUrl, ...extraOrigins]));

// Централизованный объект конфигурации для всего backend.
module.exports = {
  nodeEnv: NODE_ENV,
  isProd,
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: rawJwtSecret || "dev-insecure-fallback-please-set-JWT_SECRET-in-env",
  port: Number(process.env.PORT || 4000),
  frontendUrl,
  allowedOrigins,
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  adminEmails: (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
};
