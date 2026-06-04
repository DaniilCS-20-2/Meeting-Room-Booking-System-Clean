const UserRepository = require("../models/userRepository");
const RoomRepository = require("../models/roomRepository");
const {
  sendBookingCreatedNotice,
  sendBookingUpdatedNotice,
  sendBookingCancelledNotice,
} = require("./mailer");

const fmtClock = (d) => {
  const date = d.toLocaleDateString("nn-NO", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
};

const formatRange = (startIso, endIso) => {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return `${fmtClock(start)} — ${fmtClock(end)}`;
};

async function resolveOwnerEmail(userId, fallbackEmail) {
  if (fallbackEmail) return fallbackEmail;
  if (!userId) return null;
  const user = await UserRepository.findById(userId);
  return user?.email || null;
}

function fireAndForget(promise) {
  promise.catch((err) => {
    console.error("[MAIL] Booking notification failed:", err.message);
  });
}

async function notifyBookingCreated({ userId, userEmail, roomId, bookings }) {
  if (!bookings?.length) return;

  const email = await resolveOwnerEmail(userId, userEmail);
  if (!email) return;

  const room = await RoomRepository.findById(roomId);
  const roomName = room?.name || "Møterom";
  const slots = bookings.map((b) => formatRange(b.start_time, b.end_time));

  fireAndForget(sendBookingCreatedNotice(email, { roomName, slots }));
}

async function notifyBookingUpdated(bookingBefore, updatedBooking) {
  if (!bookingBefore || !updatedBooking) return;

  const email = await resolveOwnerEmail(bookingBefore.user_id, bookingBefore.user_email);
  if (!email) return;

  fireAndForget(sendBookingUpdatedNotice(email, {
    roomName: bookingBefore.room_name || "Møterom",
    previousTime: formatRange(bookingBefore.start_time, bookingBefore.end_time),
    newTime: formatRange(updatedBooking.start_time, updatedBooking.end_time),
  }));
}

async function notifyBookingCancelled(booking) {
  if (!booking) return;

  const email = await resolveOwnerEmail(booking.user_id, booking.user_email);
  if (!email) return;

  fireAndForget(sendBookingCancelledNotice(email, {
    roomName: booking.room_name || "Møterom",
    time: formatRange(booking.start_time, booking.end_time),
  }));
}

async function notifySeriesCancelled(booking, cancelledCount) {
  if (!booking || !cancelledCount) return;

  const email = await resolveOwnerEmail(booking.user_id, booking.user_email);
  if (!email) return;

  fireAndForget(sendBookingCancelledNotice(email, {
    roomName: booking.room_name || "Møterom",
    time: cancelledCount === 1
      ? formatRange(booking.start_time, booking.end_time)
      : `${cancelledCount} framtidige bookingar i serien`,
  }));
}

module.exports = {
  notifyBookingCreated,
  notifyBookingUpdated,
  notifyBookingCancelled,
  notifySeriesCancelled,
};
