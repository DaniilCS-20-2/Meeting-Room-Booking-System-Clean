// Модалка создания/редактирования брони — единая точка входа из календаря.
// Логика:
//  - mode "create" → даты можно править, доступен блок «Gjentakande møte».
//  - mode "edit"   → start_time заблокирован, end_time можно менять
//    (бэкенд валидирует конфликты). Также показываются кнопки «Avbestill» и
//    «Avbestill heile serien» (последняя — если бронь часть серии).
import React, { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { t } from "../i18n/labels";
import { ConfirmDialog } from "./ConfirmDialog";

// Понедельник первым — привычный для нн-NO порядок.
const WEEKDAYS = [
  { id: 1, label: "Må" },
  { id: 2, label: "Ty" },
  { id: 3, label: "On" },
  { id: 4, label: "To" },
  { id: 5, label: "Fr" },
  { id: 6, label: "La" },
  { id: 0, label: "Sø" },
];

// Сериализация Date → строка для <input type="datetime-local">.
const toLocalInput = (date) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
};

// Парсинг строки <datetime-local> в ISO без сюрпризов с TZ
// (значение в инпуте — локальное время; new Date(value) уже это учитывает).
const parseLocalInput = (value) => new Date(value);

export const BookingModal = ({
  mode = "create",
  room,
  booking = null,
  initialStart = null,
  initialEnd = null,
  isAdmin = false,
  currentUserId = null,
  token,
  onClose,
  onSaved,
}) => {
  const isEdit = mode === "edit";

  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [comment, setComment] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestDescription, setGuestDescription] = useState("");
  const [showCommentFields, setShowCommentFields] = useState(false);
  const [showGuestFields, setShowGuestFields] = useState(false);
  const [useRecurring, setUseRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState(() => new Set());
  const [untilDate, setUntilDate] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);

  // Заполняем поля исходными данными (зависит от режима).
  useEffect(() => {
    if (isEdit && booking) {
      setStart(toLocalInput(new Date(booking.start_time)));
      setEnd(toLocalInput(new Date(booking.end_time)));
      setComment(booking.comment || "");
    } else if (initialStart && initialEnd) {
      setStart(toLocalInput(initialStart));
      setEnd(toLocalInput(initialEnd));
    }
  }, [isEdit, booking, initialStart, initialEnd]);

  // Закрытие по Esc для удобства.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isOwner = booking?.user_id && booking.user_id === currentUserId;
  const canEditThisBooking = isEdit && (isOwner || isAdmin);

  const toggleWeekday = (id) => {
    setWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Универсальный «спросить, потом выполнить»: один поток для create/edit/cancel.
  // variant управляет цветом кнопки подтверждения: "success" для сохранения, "danger" для отмены/удаления.
  const askThenRun = ({ title, text, run, variant = "success" }) => {
    setError("");
    setConfirm({
      title,
      text,
      variant,
      action: async () => {
        try {
          setBusy(true);
          await run();
          setBusy(false);
          setConfirm(null);
          onSaved?.();
          onClose?.();
        } catch (err) {
          setBusy(false);
          setConfirm(null);
          setError(err.message || "Noko gjekk gale.");
        }
      },
    });
  };

  const [createdInfo, setCreatedInfo] = useState(null);

  const handleCreate = async () => {
    if (!start || !end) {
      setError("Vel start- og sluttid.");
      return;
    }
    let recurring = null;
    if (useRecurring) {
      if (weekdays.size === 0) { setError("Vel minst éin ukedag."); return; }
      if (!untilDate) { setError("Vel sluttdato for serien."); return; }
      const until = new Date(untilDate);
      until.setHours(23, 59, 59, 999);
      recurring = { weekdays: [...weekdays], untilDate: until.toISOString() };
    }
    setError("");
    setCreatedInfo(null);
    try {
      setBusy(true);
      const result = await apiFetch("/bookings", {
        method: "POST",
        token,
        body: {
          roomId: room.id,
          startDateTime: parseLocalInput(start).toISOString(),
          endDateTime: parseLocalInput(end).toISOString(),
          comment: comment.trim() || null,
          guestFirstName: guestFirstName.trim() || null,
          guestDescription: guestDescription.trim() || null,
          recurring,
        },
      });
      setBusy(false);
      // Если серия создана с пропущенными днями — показываем инфо.
      if (result?.totalSkipped > 0) {
        setCreatedInfo({
          created: result.totalCreated,
          skipped: result.totalSkipped,
        });
      } else {
        onSaved?.();
        onClose?.();
      }
    } catch (err) {
      setBusy(false);
      setError(err.message || "Noko gjekk gale.");
    }
  };

  const handleUpdateEndTime = () => {
    if (!end) { setError("Vel ny sluttid."); return; }
    const newEnd = parseLocalInput(end);
    askThenRun({
      title: t.modal_confirm_update_title,
      text: t.modal_confirm_update_text,
      run: () => apiFetch(`/bookings/${booking.id}`, {
        method: "PATCH",
        token,
        body: { endDateTime: newEnd.toISOString() },
      }),
    });
  };

  const handleCancelOne = () => {
    askThenRun({
      title: t.modal_confirm_cancel_title,
      text: t.modal_confirm_cancel_text,
      run: () => apiFetch(`/bookings/${booking.id}/cancel`, { method: "PATCH", token }),
      variant: "danger",
    });
  };

  const handleCancelSeries = () => {
    askThenRun({
      title: t.modal_confirm_cancel_series_title,
      text: t.modal_confirm_cancel_series_text,
      run: () => apiFetch(`/bookings/${booking.id}/series`, { method: "DELETE", token }),
      variant: "danger",
    });
  };

  const oldEndStr = isEdit && booking
    ? new Date(booking.end_time).toLocaleString("nn-NO", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
          <header className="modal__header">
            <h3 className="modal__title">
              {isEdit ? t.modal_title_edit : t.modal_title_create}
            </h3>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
          </header>

          <div className="modal__body">
            <label className="form-label">{t.room_from}
              <input
                className="form-input"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={isEdit}
                required
              />
            </label>
            <label className="form-label">{t.room_to}
              <input
                className="form-input"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                required
              />
            </label>

            {isEdit && (
              <p className="helper-text">
                {t.modal_edit_end_hint} {t.modal_original_end}: {oldEndStr}.
              </p>
            )}

            <div className="booking-collapsible">
              <button
                type="button"
                className="booking-collapsible__toggle"
                onClick={() => setShowCommentFields((open) => !open)}
                aria-expanded={showCommentFields}
              >
                <span>{t.room_comment_label} (valfritt)</span>
                <span aria-hidden="true">{showCommentFields ? "−" : "+"}</span>
              </button>
              {showCommentFields && (
                <label className="form-label">
                  <textarea
                    className="form-input form-input--textarea"
                    rows={2}
                    maxLength={500}
                    placeholder={t.room_comment_placeholder_book}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={isEdit}
                  />
                </label>
              )}
            </div>

            {!isEdit && (
              <div className="booking-collapsible">
                <button
                  type="button"
                  className="booking-collapsible__toggle"
                  onClick={() => setShowGuestFields((open) => !open)}
                  aria-expanded={showGuestFields}
                >
                  <span>{t.booking_guest_title}</span>
                  <span aria-hidden="true">{showGuestFields ? "−" : "+"}</span>
                </button>
                {showGuestFields && (
                  <fieldset className="booking-guest-fields">
                    <label className="form-label">{t.booking_guest_names}
                      <input
                        className="form-input"
                        value={guestFirstName}
                        onChange={(e) => setGuestFirstName(e.target.value)}
                        maxLength={300}
                        placeholder={t.booking_guest_names_placeholder}
                      />
                    </label>
                    <label className="form-label">{t.booking_guest_description}
                      <textarea
                        className="form-input form-input--textarea"
                        rows={2}
                        maxLength={500}
                        placeholder={t.booking_guest_description_placeholder}
                        value={guestDescription}
                        onChange={(e) => setGuestDescription(e.target.value)}
                      />
                    </label>
                  </fieldset>
                )}
              </div>
            )}

            {!isEdit && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useRecurring}
                    onChange={(e) => setUseRecurring(e.target.checked)}
                  />
                  {t.modal_recurring_toggle}
                </label>
                {useRecurring && (
                  <div className="recurring-block">
                    <p className="helper-text">{t.modal_recurring_hint}</p>
                    <div className="weekday-picker">
                      {WEEKDAYS.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          className={`weekday-btn ${weekdays.has(w.id) ? "weekday-btn--active" : ""}`}
                          onClick={() => toggleWeekday(w.id)}
                        >{w.label}</button>
                      ))}
                    </div>
                    <label className="form-label">{t.modal_recurring_until}
                      <input
                        className="form-input"
                        type="date"
                        value={untilDate}
                        onChange={(e) => setUntilDate(e.target.value)}
                      />
                    </label>
                  </div>
                )}
              </>
            )}

            {error && <p className="error-text">{error}</p>}

            {createdInfo && (
              <div className="info-block">
                <p className="info-text">
                  {t.modal_series_created_partial?.replace("{created}", createdInfo.created).replace("{skipped}", createdInfo.skipped) ||
                    `Serien oppretta: ${createdInfo.created} bookingar. ${createdInfo.skipped} tidspunkt var opptatt og vart hoppa over.`}
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => { onSaved?.(); onClose?.(); }}
                >
                  OK
                </button>
              </div>
            )}
          </div>

          <footer className="modal__footer">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              {t.modal_cancel_btn}
            </button>
            {!isEdit && (
              <button type="button" className="btn btn--primary" onClick={handleCreate} disabled={busy}>
                {t.modal_save_btn}
              </button>
            )}
            {isEdit && canEditThisBooking && (
              <>
                <button type="button" className="btn btn--small btn--danger" onClick={handleCancelOne} disabled={busy}>
                  {t.room_cancel_booking}
                </button>
                {booking?.recurrence_group_id && (
                  <button type="button" className="btn btn--small btn--danger" onClick={handleCancelSeries} disabled={busy}>
                    {t.modal_cancel_series_btn}
                  </button>
                )}
                <button type="button" className="btn btn--primary" onClick={handleUpdateEndTime} disabled={busy}>
                  {t.modal_update_btn}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          text={confirm.text}
          variant={confirm.variant}
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
};
