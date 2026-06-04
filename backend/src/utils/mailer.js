const nodemailer = require("nodemailer");
const env = require("../config/env");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass,
  },
});

async function sendVerificationCode(toEmail, code) {
  const mailOptions = {
    from: `"Møteromsbooking" <${env.smtpUser}>`,
    to: toEmail,
    subject: "Din stadfestingskode",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1f2937">Stadfestingskode</h2>
        <p style="color:#374151;font-size:15px">Bruk denne koden for å stadfeste handlinga di:</p>
        <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
          <span style="font-size:32px;font-weight:700;letter-spacing:6px;color:#111827">${code}</span>
        </div>
        <p style="color:#6b7280;font-size:13px">Koden er gyldig i 15 minutt. Ikkje del han med nokon.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Verification code sent to ${toEmail}`);
  } catch (err) {
    console.error(`[MAIL] Failed to send to ${toEmail}:`, err.message);
    throw err;
  }
}

function bookingCard(roomName, timeHtml) {
  return `
    <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:16px 0">
      <p style="margin:0 0 4px;font-weight:700;color:#111827">${roomName}</p>
      ${timeHtml}
    </div>
  `;
}

async function sendBookingCreatedNotice(toEmail, { roomName, slots }) {
  const slotsHtml = slots
    .map((slot) => `<p style="margin:0 0 6px;color:#374151">${slot}</p>`)
    .join("");

  const mailOptions = {
    from: `"Møteromsbooking" <${env.smtpUser}>`,
    to: toEmail,
    subject: "Booking bekrefta",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#166534">Booking bekrefta</h2>
        <p style="color:#374151;font-size:15px">Bookinga di er registrert:</p>
        ${bookingCard(roomName, slotsHtml)}
        <p style="color:#6b7280;font-size:13px">Du får denne meldinga som stadfesting.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Booking created notice sent to ${toEmail}`);
  } catch (err) {
    console.error(`[MAIL] Failed to send booking created notice to ${toEmail}:`, err.message);
    throw err;
  }
}

async function sendBookingUpdatedNotice(toEmail, { roomName, previousTime, newTime }) {
  const mailOptions = {
    from: `"Møteromsbooking" <${env.smtpUser}>`,
    to: toEmail,
    subject: "Booking endra",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#1d4ed8">Booking endra</h2>
        <p style="color:#374151;font-size:15px">Bookinga di er oppdatert:</p>
        ${bookingCard(
          roomName,
          `<p style="margin:0 0 6px;color:#6b7280"><s>${previousTime}</s></p>
           <p style="margin:0;color:#374151">${newTime}</p>`
        )}
        <p style="color:#6b7280;font-size:13px">Du får denne meldinga som stadfesting.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Booking updated notice sent to ${toEmail}`);
  } catch (err) {
    console.error(`[MAIL] Failed to send booking updated notice to ${toEmail}:`, err.message);
    throw err;
  }
}

async function sendBookingCancelledNotice(toEmail, { roomName, time }) {
  const mailOptions = {
    from: `"Møteromsbooking" <${env.smtpUser}>`,
    to: toEmail,
    subject: "Booking avbestilt",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#991b1b">Booking avbestilt</h2>
        <p style="color:#374151;font-size:15px">Bookinga di er avbestilt:</p>
        ${bookingCard(roomName, `<p style="margin:0;color:#374151">${time}</p>`)}
        <p style="color:#6b7280;font-size:13px">Kontakt administrasjonen om du har spørsmål.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[MAIL] Booking cancelled notice sent to ${toEmail}`);
  } catch (err) {
    console.error(`[MAIL] Failed to send booking cancelled notice to ${toEmail}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendVerificationCode,
  sendBookingCreatedNotice,
  sendBookingUpdatedNotice,
  sendBookingCancelledNotice,
};
