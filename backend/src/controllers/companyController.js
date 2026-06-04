const CompanyRepository = require("../models/companyRepository");
const HttpError = require("../utils/httpError");

// Публичный список компаний (нужен странице регистрации).
const getPublicList = async (_req, res, next) => {
  try {
    const items = await CompanyRepository.findAll();
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

const getAll = async (_req, res, next) => {
  try {
    const items = await CompanyRepository.findAll();
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const color = String(req.body.color || "#3b82f6").trim();
    if (!name) throw new HttpError(400, "Namn er påkravd.");
    if (!CompanyRepository.isValidColor(color)) {
      throw new HttpError(400, "Ugyldig fargekode (bruk #RRGGBB).");
    }
    const item = await CompanyRepository.create({ name, color });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    // Unique-нарушение по name.
    if (err && err.code === "23505") {
      return next(new HttpError(409, "Eit selskap med dette namnet finst allereie."));
    }
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const name = req.body.name != null ? String(req.body.name).trim() : null;
    const color = req.body.color != null ? String(req.body.color).trim() : null;
    if (name != null && name.length === 0) {
      throw new HttpError(400, "Namn kan ikkje vere tomt.");
    }
    if (color != null && !CompanyRepository.isValidColor(color)) {
      throw new HttpError(400, "Ugyldig fargekode (bruk #RRGGBB).");
    }
    const item = await CompanyRepository.update(req.params.id, { name, color });
    if (!item) throw new HttpError(404, "Selskap ikkje funne.");
    res.json({ success: true, data: item });
  } catch (err) {
    if (err && err.code === "23505") {
      return next(new HttpError(409, "Eit selskap med dette namnet finst allereie."));
    }
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const deleted = await CompanyRepository.remove(req.params.id);
    if (!deleted) throw new HttpError(404, "Selskap ikkje funne.");
    res.json({ success: true, data: { deleted: true } });
  } catch (err) {
    next(err);
  }
};

const uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(400, "Ingen fil lasta opp.");
    const logoUrl = `/uploads/${req.file.filename}`;
    const item = await CompanyRepository.setLogo(req.params.id, logoUrl);
    if (!item) throw new HttpError(404, "Selskap ikkje funne.");
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
};

module.exports = { getPublicList, getAll, create, update, remove, uploadLogo };
