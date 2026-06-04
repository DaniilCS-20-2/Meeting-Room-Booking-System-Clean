const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
// Импортируем конфигурацию окружения.
const env = require("./config/env");

// Импортируем маршруты аутентификации.
const authRoutes = require("./routes/authRoutes");
// Импортируем маршруты комнат.
const roomRoutes = require("./routes/roomRoutes");
// Импортируем маршруты бронирований.
const bookingRoutes = require("./routes/bookingRoutes");
// Импортируем маршруты профиля.
const profileRoutes = require("./routes/profileRoutes");
// Импортируем маршруты комментариев.
const commentRoutes = require("./routes/commentRoutes");
// Импортируем маршруты администрирования.
const adminRoutes = require("./routes/adminRoutes");
// Публичные маршруты компаний (список для страницы регистрации).
const companyRoutes = require("./routes/companyRoutes");
const displayRoutes = require("./routes/displayRoutes");

// Импортируем глобальный middleware обработки ошибок.
const errorMiddleware = require("./middlewares/errorMiddleware");
// Импортируем общий rate limiter.
const { apiLimiter } = require("./middlewares/rateLimitMiddleware");

// Создаём экземпляр Express-приложения.
const app = express();

// За reverse-proxy (nginx/Caddy) Express должен видеть реальный IP клиента,
// иначе rate-limit будет считать все запросы с одного адреса (proxy).
app.set("trust proxy", 1);

// Helmet — базовые security headers (HSTS, X-Content-Type-Options, frameguard и т.д.).
// CSP включаем только в проде, чтобы не мешал dev-инструментам React.
app.use(
  helmet({
    contentSecurityPolicy: env.isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", ...env.allowedOrigins],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            // Infoskjermen встраивает /display в iframe на TV.
            frameAncestors: [
              "'self'",
              "https://app.infoskjermen.no",
              "https://infoskjermen.no",
              "https://www.infoskjermen.no",
            ],
          },
        }
      : false,
    // HSTS включаем только в проде, иначе браузер будет требовать HTTPS и в dev.
    hsts: env.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    // Отключаем COEP/CORP, иначе ломаются картинки-ссылки на /uploads из другого origin.
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS. В production — строгий allowlist из env.allowedOrigins (фронт+extra).
// В development разрешаем любой origin: типичный кейс — открыть сайт с
// телефона по LAN-адресу (http://192.168.x.x:5173), чтобы протестировать.
app.use(
  cors({
    origin: (origin, cb) => {
      if (!env.isProd) return cb(null, true);
      if (!origin) return cb(null, false);
      if (env.allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} is not allowed`));
    },
    credentials: true,
  })
);

// Разумный лимит тела JSON — защита от DoS гигантскими payload'ами.
app.use(express.json({ limit: "100kb" }));

// Общий rate limit на весь API. Файлы /uploads и /health ниже — до лимита.
app.use("/api", apiLimiter);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Простейший healthcheck для мониторинга состояния сервиса.
app.get("/health", (_req, res) => {
  // Возвращаем статус «ok» для систем мониторинга.
  res.json({ status: "ok" });
});

// Монтируем API маршруты под соответствующими префиксами.
app.use("/api/auth", authRoutes);       // Аутентификация и регистрация.
app.use("/api/rooms", roomRoutes);       // CRUD комнат.
app.use("/api/bookings", bookingRoutes); // Бронирования.
app.use("/api/profile", profileRoutes);  // Профиль пользователя.
app.use("/api/comments", commentRoutes); // Комментарии к комнатам.
app.use("/api/companies", companyRoutes); // Публичный список компаний.
app.use("/api/display", displayRoutes);   // Infoskjerm / korridor-TV.
app.use("/api/admin", adminRoutes);      // Администрирование пользователей.

// Production: отдаём собранный React (backend/public) с одного домена.
if (env.isProd) {
  const publicDir = path.join(__dirname, "../public");
  app.use(express.static(publicDir, { index: false }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path === "/health") {
      return next();
    }
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

// Подключаем глобальный обработчик ошибок (должен быть последним middleware).
app.use(errorMiddleware);

// Экспортируем приложение для запуска и тестирования.
module.exports = app;
