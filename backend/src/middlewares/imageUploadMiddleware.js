// Жёсткая обработка загрузки изображений:
// 1) multer складывает файл в ПАМЯТЬ (memoryStorage), чтобы на диск попадал
//    только после всех проверок;
// 2) file-type смотрит magic bytes и отсеивает файлы, у которых содержимое
//    не совпадает с разрешёнными форматами (jpeg/png/gif/webp);
// 3) sharp перекодирует картинку в JPEG с ресайзом и `withoutMetadata()` —
//    это удаляет EXIF/GPS, убивает потенциально вредоносные мета-теги и
//    «полиглоты» (jpeg + js внутри);
// 4) готовый JPEG пишется в /uploads с детерминированным безопасным именем.
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const crypto = require("crypto");
const sharp = require("sharp");
const FileType = require("file-type");

const UPLOAD_DIR = path.join(__dirname, "../../uploads");
const ALLOWED = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

// multer в памяти с лимитом размера и быстрым mime-фильтром (первая линия обороны).
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|gif|webp)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

// Middleware-обёртка: принимает fieldName + prefix для имени файла и
// возвращает последовательность middleware для роутера.
const processImage = ({ fieldName = "file", prefix = "img", maxSide = 1024, quality = 85, preferPng = false } = {}) => {
  const mwMulter = memoryUpload.single(fieldName);

  const mwProcess = async (req, res, next) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ success: false, message: "No file uploaded." });
      }
      // Проверка magic bytes: mime от клиента не доверяем.
      const detected = await FileType.fromBuffer(req.file.buffer);
      if (!detected || !ALLOWED.has(detected.ext)) {
        return res.status(400).json({ success: false, message: "Unsupported image format." });
      }
      // Перекодируем через sharp: ресайз (не больше maxSide по длинной стороне),
      // JPEG + strip metadata. Это убивает EXIF, GPS, XMP, ICC и любые
      // хитро вшитые «полиглоты».
      const pipeline = sharp(req.file.buffer, { failOn: "error" })
        .rotate()
        .resize({
          width: maxSide,
          height: maxSide,
          fit: "inside",
          withoutEnlargement: true,
        });

      const usePng = preferPng && (detected.ext === "png" || detected.ext === "webp");
      let processedBuffer;
      let ext;
      if (usePng) {
        processedBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        ext = "png";
      } else {
        processedBuffer = await pipeline.jpeg({ quality, mozjpeg: true }).withMetadata({}).toBuffer();
        ext = "jpg";
      }

      const safePrefix = String(prefix).replace(/[^a-z0-9_-]/gi, "").slice(0, 60) || "img";
      const rand = crypto.randomBytes(6).toString("hex");
      const filename = `${safePrefix}-${Date.now()}-${rand}.${ext}`;

      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      await fs.writeFile(path.join(UPLOAD_DIR, filename), processedBuffer);

      // Кладём финальные поля как у multer.diskStorage, чтобы контроллерам
      // не пришлось ничего менять.
      req.file.filename = filename;
      req.file.path = path.join(UPLOAD_DIR, filename);
      return next();
    } catch (err) {
      return next(err);
    }
  };

  return [mwMulter, mwProcess];
};

module.exports = { processImage };
