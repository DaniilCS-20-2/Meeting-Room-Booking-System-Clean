const BookingRepository = require("../models/bookingRepository");
const HttpError = require("../utils/httpError");

const formatGuest = (row) => {
  const names = [row.guest_first_name, row.guest_last_name].filter(Boolean).join(" ").trim();
  const desc = (row.guest_description || "").trim();
  if (names && desc) return `${names} — ${desc}`;
  if (names) return names;
  if (desc) return desc;
  return null;
};

const toDisplayItem = (row) => ({
  id: row.id,
  roomName: row.room_name,
  startTime: row.start_time,
  endTime: row.end_time,
  companyName: row.company_name || null,
  companyColor: row.company_color || null,
  companyLogoUrl: row.company_logo || null,
  hostName: row.user_name || null,
  guestLabel: formatGuest(row),
});

// Публичный список встреч на день — для infoskjerm / TV i gangen.
// Query: from, to — ISO-строки границ дня (локальное время клиента).
const getToday = async (req, res, next) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) {
      throw new HttpError(400, "Parametrane from og to er påkravde.");
    }
    const rows = await BookingRepository.findAllInRange({ from, to });
    const now = Date.now();
    const upcoming = rows.filter((row) => new Date(row.end_time).getTime() > now);
    res.json({
      success: true,
      data: upcoming.map(toDisplayItem),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getToday };
