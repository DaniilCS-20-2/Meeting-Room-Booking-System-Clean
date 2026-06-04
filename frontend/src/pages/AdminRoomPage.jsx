import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch, apiUpload, resolveUploadUrl } from "../api";
import { t } from "../i18n/labels";
import { ConfirmDialog } from "../components/ConfirmDialog";

const toSrc = resolveUploadUrl;

export const AdminRoomPage = () => {
  const { roomId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const isEdit = !!roomId;
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    name: "",
    location: "",
    capacity: 6,
    description: "",
    equipment: "",
    minBookingMinutes: 15,
    maxBookingMinutes: 480,
    // Цвет комнаты для общего календаря на главной. Если не задан (null/"")
    // — фронт использует детерминированный hash-фолбэк по id.
    color: "",
  });
  const [photos, setPhotos] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [noMinLimit, setNoMinLimit] = useState(false);
  const [noMaxLimit, setNoMaxLimit] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const [disabledReason, setDisabledReason] = useState("");
  const [showDisableReason, setShowDisableReason] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    if (!isEdit || !token) return;
    apiFetch(`/rooms/${roomId}`, { token }).then((room) => {
      setForm({
        name: room.name || "",
        location: room.location || "",
        capacity: room.capacity || 6,
        description: room.description || "",
        equipment: room.equipment || "",
        minBookingMinutes: room.min_booking_minutes ?? 15,
        maxBookingMinutes: room.max_booking_minutes ?? 480,
        color: room.color || "",
      });
      setPhotos(room.photos || []);
      setNoMinLimit(room.min_booking_minutes == null);
      setNoMaxLimit(room.max_booking_minutes == null);
      setIsDisabled(room.is_disabled);
      setDisabledReason(room.disabled_reason || "");
      setShowDisableReason(room.is_disabled);
    }).catch(() => {});
  }, [roomId, token, isEdit]);

  const handleChange = (e) => {
    const val = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((p) => ({ ...p, [e.target.name]: val }));
  };

  const handleAddPhoto = () => {
    fileRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (!isEdit) {
      setPendingFiles((prev) => [...prev, file]);
      e.target.value = "";
      return;
    }
    setUploading(true);
    try {
      const room = await apiUpload(`/rooms/${roomId}/photo`, { file, fieldName: "photo", token });
      setPhotos(room.photos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDeletePhoto = async (target) => {
    if (target && target.pendingIdx != null) {
      setPendingFiles((prev) => prev.filter((_, i) => i !== target.pendingIdx));
      setConfirmDelete(null);
      return;
    }
    try {
      const room = await apiFetch(`/rooms/${roomId}/photo`, {
        method: "DELETE", token,
        body: { photoUrl: target.url },
      });
      setPhotos(room.photos || []);
    } catch (err) {
      setError(err.message);
    }
    setConfirmDelete(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (isEdit && isDisabled && !disabledReason.trim()) {
      setError("Skriv kvifor rommet er ute av drift.");
      return;
    }
    const payload = {
      ...form,
      minBookingMinutes: noMinLimit ? null : form.minBookingMinutes,
      maxBookingMinutes: noMaxLimit ? null : form.maxBookingMinutes,
      // Пустая строка → null, чтобы бэкенд снял пользовательский цвет и фронт
      // снова стал использовать hash-фолбэк.
      color: form.color || null,
    };
    try {
      if (isEdit) {
        await apiFetch(`/rooms/${roomId}`, { method: "PUT", token, body: payload });
        if (isDisabled) {
          await apiFetch(`/rooms/${roomId}/disable`, {
            method: "PATCH",
            token,
            body: { isDisabled: true, reason: disabledReason.trim() },
          });
        }
      } else {
        const created = await apiFetch("/rooms", { method: "POST", token, body: payload });
        if (pendingFiles.length > 0 && created?.id) {
          setUploading(true);
          for (const file of pendingFiles) {
            try {
              await apiUpload(`/rooms/${created.id}/photo`, { file, fieldName: "photo", token });
            } catch (err) {
              setError(err.message);
            }
          }
          setUploading(false);
        }
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleDisable = async () => {
    const nextDisabled = !isDisabled;
    if (nextDisabled && !showDisableReason) {
      setShowDisableReason(true);
      setError("");
      return;
    }
    if (nextDisabled && !disabledReason.trim()) {
      setError("Skriv kvifor rommet er ute av drift.");
      return;
    }
    try {
      const room = await apiFetch(`/rooms/${roomId}/disable`, {
        method: "PATCH", token,
        body: { isDisabled: nextDisabled, reason: disabledReason.trim() },
      });
      setIsDisabled(room.is_disabled);
      setDisabledReason(room.disabled_reason || "");
      setShowDisableReason(room.is_disabled);
      setError("");
    } catch (err) {
      alert(err.message);
    }
  };

  const pendingPreviews = React.useMemo(
    () => pendingFiles.map((f) => URL.createObjectURL(f)),
    [pendingFiles]
  );
  useEffect(() => () => pendingPreviews.forEach((u) => URL.revokeObjectURL(u)), [pendingPreviews]);

  const mainPhoto = photos[0] ? toSrc(photos[0]) : (pendingPreviews[0] || null);

  return (
    <section className="page" style={{ maxWidth: 960 }}>
      <h1 className="page__title">{isEdit ? t.admin_room_title_edit : t.admin_room_title_new}</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="admin-room-layout">
        <div className="admin-room-left">
          <div className="admin-room-main-photo">
            {mainPhoto
              ? <img src={mainPhoto} alt="" className="admin-room-main-photo__img" />
              : <div className="admin-room-main-photo__empty"
                  onClick={handleAddPhoto}
                  style={{ cursor: "pointer" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                    <path d="M12 16a4 4 0 100-8 4 4 0 000 8z" fill="#bbb"/>
                    <path d="M9 2L7.17 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2h-3.17L15 2H9z" stroke="#bbb" strokeWidth="1.5" fill="none"/>
                  </svg>
                  <span style={{ color: "#9ca3af", fontSize: 14, marginTop: 6, textAlign: "center", padding: "0 12px" }}>
                    Legg til bilete
                  </span>
                </div>}
          </div>
          <div className="admin-photos__thumbs">
            {photos.map((url, i) => (
              <div key={`p-${i}`} className="admin-photos__thumb">
                <img src={toSrc(url)} alt="" className="admin-photos__thumb-img" />
                <button type="button" className="admin-photos__remove"
                  onClick={() => setConfirmDelete({ url })} title="Slett bilete">✕</button>
              </div>
            ))}
            {pendingPreviews.map((src, i) => (
              <div key={`f-${i}`} className="admin-photos__thumb">
                <img src={src} alt="" className="admin-photos__thumb-img" />
                <button type="button" className="admin-photos__remove"
                  onClick={() => setConfirmDelete({ pendingIdx: i })} title="Slett bilete">✕</button>
              </div>
            ))}
            <div className="admin-photos__thumb admin-photos__thumb--add" onClick={handleAddPhoto}>
              {uploading ? "..." : "+"}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
        </div>

        <form className="form-card admin-room-form" onSubmit={handleSubmit}>
          <label className="form-label">{t.admin_room_name}
            <input className="form-input" name="name" value={form.name} onChange={handleChange} required />
          </label>
          <label className="form-label">{t.admin_room_location}
            <input className="form-input" name="location" value={form.location} onChange={handleChange} />
          </label>
          <label className="form-label">{t.admin_room_capacity}
            <input className="form-input" type="number" name="capacity" value={form.capacity} onChange={handleChange} min={1} required />
          </label>
          <label className="form-label">{t.admin_room_description}
            <textarea className="form-input form-textarea" name="description" value={form.description} onChange={handleChange} />
          </label>
          <label className="form-label">{t.admin_room_equipment}
            <input className="form-input" name="equipment" value={form.equipment} onChange={handleChange} />
          </label>
          <label className="form-label">{t.admin_room_color}
            <div className="admin-room-color-row">
              <label
                className="color-chip"
                style={{ background: form.color || "#94a3b8", color: "#fff" }}
                title={t.admin_room_color_pick}
              >
                <span className="color-chip__label">{t.admin_room_color_pick}</span>
                <input
                  type="color"
                  className="color-chip__input"
                  value={form.color || "#4f46e5"}
                  onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                />
              </label>
              {form.color && (
                <button
                  type="button"
                  className="btn btn--tiny"
                  onClick={() => setForm((p) => ({ ...p, color: "" }))}
                  title={t.admin_room_color_reset}
                >
                  {t.admin_room_color_reset}
                </button>
              )}
            </div>
          </label>
          <div className="admin-room-times">
            <label className="form-label">{t.admin_room_min}
              <div className="admin-room-times__row">
                <input className="form-input" type="number" name="minBookingMinutes"
                  value={noMinLimit ? "" : form.minBookingMinutes}
                  onChange={handleChange} min={1} step={1} disabled={noMinLimit} />
                <label className="checkbox-label">
                  <input type="checkbox" checked={noMinLimit}
                    onChange={(e) => setNoMinLimit(e.target.checked)} />
                  {t.admin_room_no_limit}
                </label>
              </div>
            </label>
            <label className="form-label">{t.admin_room_max}
              <div className="admin-room-times__row">
                <input className="form-input" type="number" name="maxBookingMinutes"
                  value={noMaxLimit ? "" : form.maxBookingMinutes}
                  onChange={handleChange} min={1} step={1} disabled={noMaxLimit} />
                <label className="checkbox-label">
                  <input type="checkbox" checked={noMaxLimit}
                    onChange={(e) => setNoMaxLimit(e.target.checked)} />
                  {t.admin_room_no_limit}
                </label>
              </div>
            </label>
          </div>
          {isEdit && showDisableReason && (
            <label className="form-label">{t.admin_room_disabled_reason}
              <textarea
                className="form-input form-textarea"
                value={disabledReason}
                onChange={(e) => setDisabledReason(e.target.value)}
                placeholder={t.admin_room_disabled_reason_placeholder}
                rows={3}
              />
            </label>
          )}
          <button className="btn btn--primary btn--full" type="submit">{t.admin_room_save}</button>
          {isEdit && (
            <button className="btn btn--full" type="button" onClick={handleToggleDisable}>
              {isDisabled ? t.admin_room_enable : t.admin_room_disable}
            </button>
          )}
        </form>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Slett bilete"
          text="Er du sikker på at du vil slette dette biletet?"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => handleDeletePhoto(confirmDelete)}
        />
      )}
    </section>
  );
};
