// Импортируем React и необходимые хуки.
import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useParams } from "react-router-dom";
// Импортируем хук аутентификации.
import { useAuth } from "../context/AuthContext";
// Импортируем обёртку для API-запросов.
import { apiFetch, resolveUploadUrl } from "../api";
import { t } from "../i18n/labels";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { BookingModal } from "../components/BookingModal";
import { getMergeFlags, mergeClassName } from "../utils/calendarMerge";

// Вспомогательная функция: генерируем массив из 7 дней начиная с указанной даты.
// Используется для построения недельного календаря.
const buildWeekGrid = (startDate) => {
  // Массив для хранения 7 дней.
  const days = [];
  // Создаём копию начальной даты.
  const d = new Date(startDate);
  // Сбрасываем время на полночь.
  d.setHours(0, 0, 0, 0);
  // Генерируем 7 последовательных дней.
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    // Прибавляем i дней к начальной дате.
    day.setDate(d.getDate() + i);
    // Добавляем день в массив.
    days.push(day);
  }
  // Возвращаем массив дней.
  return days;
};

// Массив часов от 0 до 23 для строк календаря.
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Возвращаем контрастный цвет текста (чёрный/белый) для произвольного HEX-фона,
// используя перцептивную яркость (формула Rec. 601). Нужен, чтобы подписи
// в ячейках календаря оставались читаемыми на любом цвете компании.
const getContrastText = (hex) => {
  if (typeof hex !== "string") return "#fff";
  const v = hex.trim().replace("#", "");
  const full = v.length === 3 ? v.split("").map((c) => c + c).join("") : v;
  if (full.length !== 6) return "#fff";
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#fff";
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 160 ? "#111827" : "#fff";
};

const toSrc = resolveUploadUrl;

// Короткие инициалы из имени/почты — для плейсхолдера аватара.
const getInitials = (name) => {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
};

// Маленький аватар-кружок: фото если есть, иначе инициалы на сером фоне.
const UserAvatar = ({ url, name, size = 26 }) => {
  const src = url ? toSrc(url) : null;
  const style = { width: size, height: size };
  if (src) return <img src={src} alt="" className="user-avatar" style={style} />;
  return <span className="user-avatar user-avatar--placeholder" style={style}>{getInitials(name)}</span>;
};

const SWIPE_THRESHOLD_PX = 48;

const RoomCarousel = ({ photos, fallback, name }) => {
  const imgs = photos.length ? photos : (fallback ? [fallback] : []);
  const [idx, setIdx] = useState(0);
  const len = imgs.length;
  const touchStart = useRef(null);

  const prev = useCallback(() => setIdx((i) => (i - 1 + len) % len), [len]);
  const next = useCallback(() => setIdx((i) => (i + 1) % len), [len]);

  useEffect(() => setIdx(0), [len]);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    if (!t) return;
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || len < 2) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next();
    else prev();
  };

  if (!len) return <div className="room-top__photo"><div className="room-top__placeholder" /></div>;

  return (
    <div className="room-carousel">
      <div
        className="room-carousel__viewport"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img src={toSrc(imgs[idx])} alt={name} className="room-carousel__img" draggable={false} />
        {len > 1 && (
          <>
            <button type="button" className="room-carousel__arrow room-carousel__arrow--left" onClick={prev}>‹</button>
            <button type="button" className="room-carousel__arrow room-carousel__arrow--right" onClick={next}>›</button>
          </>
        )}
      </div>
      {len > 1 && (
        <div className="room-carousel__dots">
          {imgs.map((_, i) => (
            <button key={i} type="button"
              className={`room-carousel__dot${i === idx ? " room-carousel__dot--active" : ""}`}
              onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
    </div>
  );
};

export const RoomPage = () => {
  // Получаем roomId из параметров URL (react-router).
  const { roomId } = useParams();
  // Получаем данные пользователя и токен из контекста.
  const { user, token } = useAuth();

  // State: данные комнаты.
  const [room, setRoom] = useState(null);
  const [roomLoadError, setRoomLoadError] = useState("");
  // State: бронирования за текущую неделю (для календаря).
  const [bookings, setBookings] = useState([]);
  // State: полная история бронирований (для списка).
  const [history, setHistory] = useState([]);
  // State: комментарии к комнате.
  const [comments, setComments] = useState([]);
  // State: текст нового комментария.
  const [commentText, setCommentText] = useState("");
  // State: модалка создания/редактирования брони.
  // open=false означает «не показывать»; в open=true сидит вся настройка для модалки.
  const [bookingModal, setBookingModal] = useState({ open: false, mode: "create", initialStart: null, initialEnd: null, booking: null });
  // State: начало текущей недели (понедельник).
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Вычисляем понедельник текущей недели (для Sunday уходим назад на 6 дней).
    const dow = d.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    d.setDate(d.getDate() + diff);
    return d;
  });

  const isAdmin = user?.role === "admin";
  // Аноним = неавторизованный посетитель; читает тот же скрабленный календарь.
  const isAnonymous = !user;
  // Viewer (read-only): видит только календарь занятости без имён/селскапов.
  const isViewer = user?.role === "viewer";
  // Тот, кому разрешено бронировать/комментировать: НЕ аноним и НЕ viewer.
  const canWrite = !isAnonymous && !isViewer;
  const canBook = canWrite && !room?.is_disabled;
  const [historySort, setHistorySort] = useState("time");
  const [confirmAction, setConfirmAction] = useState(null);
  const [companies, setCompanies] = useState([]);

  // Загружаем данные комнаты — публичный эндпоинт, токен опционален.
  useEffect(() => {
    setRoomLoadError("");
    apiFetch(`/rooms/${roomId}`, { token })
      .then(setRoom)
      .catch(() => setRoomLoadError(t.global_error || "Kunne ikkje laste rommet."));
  }, [roomId, token]);

  // Загружаем бронирования (публично) и историю (только для авторизованных).
  const loadBookings = () => {
    const from = weekStart.toISOString();
    const to = new Date(weekStart.getTime() + 7 * 86400000).toISOString();
    apiFetch(`/bookings/room/${roomId}?from=${from}&to=${to}`, { token }).then(setBookings).catch(() => {});
    if (token && canWrite) {
      apiFetch(`/bookings/room/${roomId}/history`, { token }).then(setHistory).catch(() => {});
    } else {
      setHistory([]);
    }
  };
  useEffect(loadBookings, [roomId, token, weekStart, canWrite]);

  // Легенда календаря должна показывать все компании из админки, даже если
  // у части компаний нет броней в этой комнате на текущей неделе.
  useEffect(() => {
    if (!canWrite) {
      setCompanies([]);
      return;
    }
    apiFetch("/companies").then(setCompanies).catch(() => setCompanies([]));
  }, [canWrite]);

  const companyLookup = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    for (const company of companies) {
      byId.set(company.id, company);
      byName.set(company.name, company);
    }
    return { byId, byName };
  }, [companies]);

  const withCurrentCompanyColor = useCallback((booking) => {
    const currentCompany = (
      (booking.company_id && companyLookup.byId.get(booking.company_id)) ||
      (booking.company_name && companyLookup.byName.get(booking.company_name))
    );
    if (!currentCompany) return booking;
    return {
      ...booking,
      company_name: currentCompany.name,
      company_color: currentCompany.color,
    };
  }, [companyLookup]);

  // Комментарии к комнате — только для авторизованных.
  const loadComments = () => {
    if (!token) return;
    apiFetch(`/comments/room/${roomId}`, { token }).then(setComments).catch(() => {});
  };
  useEffect(loadComments, [roomId, token]);

  // Открытие модалки для создания брони — клик по ячейке.
  // Если forcedStart/forcedEnd переданы (например, свободный gap в частично занятой ячейке),
  // используем их; иначе даём слот в 1 час.
  const openCreateModal = (day, hour, forcedStart = null, forcedEnd = null) => {
    if (!canBook) return;
    const cellStart = new Date(day);
    cellStart.setHours(hour, 0, 0, 0);
    // Слот в прошлом — не открываем модалку.
    if (cellStart <= new Date()) return;
    const cellEnd = new Date(cellStart.getTime() + 60 * 60 * 1000);
    const start = forcedStart || cellStart;
    const end = forcedEnd || cellEnd;
    setBookingModal({ open: true, mode: "create", initialStart: start, initialEnd: end, booking: null });
  };

  // Открытие модалки из «зелёных кнопок» ближайших свободных слотов.
  // Время уже подобрано так, чтобы не пересекаться с занятыми бронями.
  const openCreateFromSlot = (slot) => {
    if (!canBook) return;
    const now = new Date(); now.setSeconds(0, 0);
    const safeStart = new Date(now.getTime() + 60_000);
    const start = slot.start <= safeStart ? safeStart : slot.start;
    setBookingModal({
      open: true,
      mode: "create",
      initialStart: start,
      initialEnd: slot.end,
      booking: null,
    });
  };

  // Ближайшие свободные «окошки» — берём из списка активных бронирований
  // (для авторизованных канWrite). Анону/viewer не показываем.
  const freeSlots = useMemo(() => {
    if (!canBook) return [];
    const now = new Date();
    now.setSeconds(0, 0);

    // Минимальная длительность слота — из настроек комнаты.
    // Если null (без ограничения) — отсеиваем «мусорные» окна короче 15 минут.
    const minMinutes = room?.min_booking_minutes ?? 15;
    const minMs = Math.max(minMinutes, 15) * 60_000;

    const activeBookings = history
      .filter((b) => b.status !== "cancelled" && new Date(b.end_time) > now)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    const endRange = new Date(now);
    endRange.setDate(endRange.getDate() + 30);
    endRange.setHours(23, 59, 0, 0);

    const rawGaps = [];
    let cursor = new Date(now);
    for (const booking of activeBookings) {
      const bStart = new Date(booking.start_time);
      const bEnd = new Date(booking.end_time);
      if (bStart > cursor) rawGaps.push({ start: new Date(cursor), end: new Date(bStart) });
      if (bEnd > cursor) cursor = new Date(bEnd);
    }
    if (cursor < endRange) rawGaps.push({ start: new Date(cursor), end: new Date(endRange) });

    const daySlots = [];
    for (const gap of rawGaps) {
      let slotStart = new Date(gap.start);
      while (slotStart < gap.end && daySlots.length < 4) {
        const dayEnd = new Date(slotStart);
        dayEnd.setHours(23, 59, 0, 0);
        const slotEnd = gap.end < dayEnd ? new Date(gap.end) : dayEnd;
        if (slotEnd.getTime() - slotStart.getTime() >= minMs) {
          daySlots.push({ start: new Date(slotStart), end: new Date(slotEnd) });
        }
        const nextDay = new Date(slotStart);
        nextDay.setDate(nextDay.getDate() + 1);
        nextDay.setHours(0, 0, 0, 0);
        slotStart = nextDay;
      }
      if (daySlots.length >= 4) break;
    }
    return daySlots;
  }, [canBook, history, room]);

  // Открытие модалки для редактирования брони — клик по своей/любой (для админа) занятой ячейке.
  const openEditModal = (booking) => {
    if (!canBook || !booking) return;
    const isOwner = booking.user_id && booking.user_id === user?.id;
    if (!isOwner && !isAdmin) return;
    if (new Date(booking.end_time) <= new Date()) return; // прошлые не редактируем
    setBookingModal({ open: true, mode: "edit", initialStart: null, initialEnd: null, booking });
  };

  const closeBookingModal = () => setBookingModal((m) => ({ ...m, open: false }));

  // ---- Drag-выделение по календарю ----
  // Состояние drag: { day, hourStart, hourEnd } (диапазон часов на одном дне).
  // Кликнул и не двигал = drag с одинаковыми hourStart/hourEnd → 1ч слот.
  // Перетащил вниз/вверх — диапазон расширяется до отпускания мыши.
  const [drag, setDrag] = useState(null);
  const suppressNextClickRef = useRef(false);

  // Открыть модалку по результату drag-выделения.
  // Сначала проверяем, что весь выделенный диапазон свободен — иначе тихо отменяем.
  const finishDrag = useCallback((d) => {
    if (!d) return;
    const lo = Math.min(d.hourStart, d.hourEnd);
    const hi = Math.max(d.hourStart, d.hourEnd);
    // Любая занятая ячейка в диапазоне → отменяем выделение.
    for (let h = lo; h <= hi; h++) {
      const slot = (() => {
        const s = new Date(d.day); s.setHours(h, 0, 0, 0);
        const e = new Date(s.getTime() + 3600000);
        return bookings.some((b) => {
          const bs = new Date(b.start_time).getTime();
          const be = new Date(b.end_time).getTime();
          return s.getTime() < be && e.getTime() > bs;
        });
      })();
      if (slot) return;
    }
    const start = new Date(d.day); start.setHours(lo, 0, 0, 0);
    if (start <= new Date()) return;
    const end = new Date(d.day); end.setHours(hi + 1, 0, 0, 0);
    setBookingModal({ open: true, mode: "create", initialStart: start, initialEnd: end, booking: null });
  }, [bookings]);

  // Глобальный mouseup: завершает drag даже если курсор ушёл с сетки.
  useEffect(() => {
    if (!drag) return;
    const onUp = () => {
      const hadRange = drag.hourStart !== drag.hourEnd;
      finishDrag(drag);
      if (hadRange) {
        suppressNextClickRef.current = true;
        window.setTimeout(() => { suppressNextClickRef.current = false; }, 0);
      }
      setDrag(null);
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [drag, finishDrag]);

  const handleCellMouseDown = (day, hour, isFree, cellInPast) => {
    if (!canBook || cellInPast || !isFree) return;
    setDrag({ day, hourStart: hour, hourEnd: hour });
  };

  const handleCellMouseEnter = (day, hour) => {
    if (!drag) return;
    // Drag ограничен одним днём (не размазываем выделение по неделям).
    if (day.toDateString() !== drag.day.toDateString()) return;
    if (hour === drag.hourEnd) return;
    setDrag({ ...drag, hourEnd: hour });
  };

  // Проверяем, попадает ли ячейка в текущее drag-выделение (для подсветки).
  const isInDrag = (day, hour) => {
    if (!drag) return false;
    if (day.toDateString() !== drag.day.toDateString()) return false;
    const lo = Math.min(drag.hourStart, drag.hourEnd);
    const hi = Math.max(drag.hourStart, drag.hourEnd);
    return hour >= lo && hour <= hi;
  };

  const handleCancel = (bookingId) => {
    setConfirmAction({
      title: "Avbestill booking",
      text: "Er du sikker på at du vil avbestille denne bookinga?",
      action: async () => {
        try {
          await apiFetch(`/bookings/${bookingId}/cancel`, { method: "PATCH", token });
          loadBookings();
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  // Админ: жёстко удалить одну запись из истории.
  const handleDeleteBooking = (bookingId) => {
    setConfirmAction({
      title: t.admin_history_delete_one,
      text: t.admin_history_confirm_delete_one,
      action: async () => {
        try {
          await apiFetch(`/admin/bookings/${bookingId}`, { method: "DELETE", token });
          loadBookings();
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  // Админ: очистить всю прошлую историю для текущей комнаты.
  const handleClearHistory = () => {
    setConfirmAction({
      title: t.admin_history_clear_all,
      text: t.admin_history_confirm_clear_all,
      action: async () => {
        try {
          await apiFetch(`/admin/rooms/${roomId}/history`, { method: "DELETE", token });
          loadBookings();
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  // Обработчик отправки нового комментария.
  const handleComment = async (e) => {
    // Предотвращаем стандартную перезагрузку страницы.
    e.preventDefault();
    // Не отправляем пустой комментарий.
    if (!commentText.trim()) return;
    try {
      // POST /api/comments/room/:roomId — создаём комментарий.
      await apiFetch(`/comments/room/${roomId}`, {
        method: "POST",
        token,
        body: { message: commentText },
      });
      // Очищаем поле ввода.
      setCommentText("");
      // Перезагружаем список комментариев.
      loadComments();
    } catch (err) {
      // Показываем ошибку через alert.
      alert(err.message);
    }
  };

  // Находит первый свободный gap в ячейке (для частично занятых).
  // Возвращает {start, end} или null, если вся ячейка занята.
  const findFreeGapInCell = (day, hour, bookingsInCell) => {
    const cellStart = new Date(day);
    cellStart.setHours(hour, 0, 0, 0);
    const cellEnd = new Date(cellStart.getTime() + 60 * 60 * 1000);
    const now = new Date();

    // Сортируем брони в ячейке по start_time
    const sorted = [...bookingsInCell].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

    // Проверяем gap перед первой бронью
    const firstBookingStart = new Date(sorted[0].start_time);
    if (firstBookingStart > cellStart) {
      const gapStart = cellStart < now ? now : cellStart;
      const gapEnd = firstBookingStart;
      if (gapEnd > gapStart && gapEnd.getTime() - gapStart.getTime() >= 5 * 60 * 1000) {
        return { start: gapStart, end: gapEnd };
      }
    }

    // Проверяем gaps между бронями
    for (let i = 0; i < sorted.length - 1; i++) {
      const endCurrent = new Date(sorted[i].end_time);
      const startNext = new Date(sorted[i + 1].start_time);
      if (startNext > endCurrent) {
        const gapStart = endCurrent < now ? now : endCurrent;
        const gapEnd = startNext;
        if (gapEnd > gapStart && gapEnd.getTime() - gapStart.getTime() >= 5 * 60 * 1000) {
          return { start: gapStart, end: gapEnd };
        }
      }
    }

    // Проверяем gap после последней брони
    const lastBookingEnd = new Date(sorted[sorted.length - 1].end_time);
    if (cellEnd > lastBookingEnd) {
      const gapStart = lastBookingEnd < now ? now : lastBookingEnd;
      const gapEnd = cellEnd;
      if (gapEnd > gapStart && gapEnd.getTime() - gapStart.getTime() >= 5 * 60 * 1000) {
        return { start: gapStart, end: gapEnd };
      }
    }

    return null;
  };

  const handleDeleteComment = (id) => {
    setConfirmAction({
      title: "Slett kommentar",
      text: "Er du sikker på at du vil slette denne kommentaren?",
      action: async () => {
        try {
          await apiFetch(`/comments/${id}`, { method: "DELETE", token });
          loadComments();
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  // Генерируем массив дней для недельного календаря.
  const weekDays = useMemo(() => buildWeekGrid(weekStart), [weekStart]);

  // Помощник: классы для адаптивного позиционирования тултипа над ячейкой.
  // На последних часах суток показываем выше; на крайних колонках —
  // прижимаем к одному из краёв ячейки, чтобы тултип не вылезал за сетку.
  const tipPosClass = (dayIdx, hour) => {
    let cls = "";
    // Переключаемся «вверх» от середины суток, чтобы тултип с описанием
    // не уезжал за нижнюю границу календаря на ячейках типа 13-15:00.
    if (hour >= 12) cls += " cal-tip--up";
    if (dayIdx >= 5) cls += " cal-tip--align-right";
    else if (dayIdx <= 1) cls += " cal-tip--align-left";
    return cls;
  };

  const getSlotInfo = (day, hour) => {
    const slotStart = new Date(day);
    slotStart.setHours(hour, 0, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + 3600000);
    const fmt = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

    const overlapping = bookings.filter((b) => {
      const bs = new Date(b.start_time).getTime();
      const be = new Date(b.end_time).getTime();
      return slotStart.getTime() < be && slotEnd.getTime() > bs;
    });

    if (overlapping.length === 0) return null;

    const currentBookings = overlapping.map(withCurrentCompanyColor);
    const labels = [];
    for (const b of currentBookings) {
      const bs = new Date(b.start_time);
      const be = new Date(b.end_time);
      const bsIn = bs >= slotStart && bs < slotEnd;
      const beIn = be > slotStart && be <= slotEnd;
      if (bsIn && beIn) labels.push(`${fmt(bs)} – ${fmt(be)}`);
      else if (bsIn) labels.push(fmt(bs));
      else if (beIn) labels.push(fmt(be));
    }
    const allPast = currentBookings.every((b) => new Date(b.end_time) <= new Date());
    const sorted = [...currentBookings].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    const primary = sorted[0];
    return {
      booked: true,
      past: allPast,
      label: [...new Set(labels)].join(" · "),
      color: primary?.company_color || null,
      companyName: primary?.company_name || null,
      userName: primary?.user_name || null,
      comment: primary?.comment || null,
      guestFirstName: primary?.guest_first_name || null,
      guestLastName: primary?.guest_last_name || null,
      guestDescription: primary?.guest_description || null,
      bookings: sorted,
    };
  };

  const slotGrid = useMemo(() => {
    const grid = {};
    for (const d of weekDays) {
      for (const h of HOURS) {
        grid[`${d.toISOString()}:${h}`] = getSlotInfo(d, h);
      }
    }
    return grid;
  }, [weekDays, bookings, withCurrentCompanyColor]);

  const fmtDate = (d) => d.toLocaleDateString("nn-NO", { day: "numeric", month: "short" });
  const fmtClock = (d) => d.toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" });
  const formatRange = (startIso, endIso) => {
    const s = new Date(startIso);
    const e = new Date(endIso);
    const sameDay = s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate();
    if (sameDay) return `${fmtDate(s)}, ${fmtClock(s)} – ${fmtClock(e)}`;
    return `${fmtDate(s)} ${fmtClock(s)} – ${fmtDate(e)} ${fmtClock(e)}`;
  };

  // Переход на предыдущую неделю.
  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  // Переход на следующую неделю.
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));

  // Пока данные комнаты не загружены — показываем индикатор загрузки.
  if (!room && !roomLoadError) return <div className="page">Lastar...</div>;
  if (!room && roomLoadError) return <div className="page"><p className="error-text">{roomLoadError}</p></div>;

  const now = new Date();
  const sortFn = (a, b) => {
    if (historySort === "activity") return new Date(b.created_at) - new Date(a.created_at);
    return new Date(b.start_time) - new Date(a.start_time);
  };
  const futureBookings = history
    .filter((b) => new Date(b.end_time) > now && b.status !== "cancelled")
    .sort(sortFn);
  const pastBookings = history
    .filter((b) => new Date(b.end_time) <= now || b.status === "cancelled")
    .sort((a, b) => {
      if (a.status === "cancelled" && b.status !== "cancelled") return 1;
      if (a.status !== "cancelled" && b.status === "cancelled") return -1;
      return sortFn(a, b);
    });

  return (
    <section className="page">
      {/* Верхняя секция: фото комнаты слева + бронирование справа. */}
      <div className="room-top">
        <RoomCarousel photos={room.photos || []} fallback={room.photo_url} name={room.name} />

        {/* Блок бронирования и информации. */}
        <div className="room-top__booking">
          {/* Название комнаты. */}
          <h1 className="room-page__title">{room.name}</h1>

          {/* Ближайшие свободные слоты + подсказка про кликабельный календарь. */}
          {room.is_disabled && (
            <div className="room-disabled-notice">
              <strong>{t.room_unavailable_title}</strong>
              <p>{room.disabled_reason || t.room_unavailable_default}</p>
            </div>
          )}
          {canBook && (
            <>
              {freeSlots.length > 0 && (
                <>
                  <p className="room-top__label">{t.room_next_free}</p>
                  <div className="room-slots">
                    {freeSlots.map((slot, i) => (
                      <button key={i} type="button" className="btn btn--slot" onClick={() => openCreateFromSlot(slot)}>
                        <span className="btn--slot__date">
                          {slot.start.toLocaleDateString("nn-NO", { day: "numeric", month: "short" })}
                        </span>
                        <span className="btn--slot__time">
                          {slot.start.toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" })}
                          {" - "}
                          {slot.end.toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="helper-text">{t.room_book_hint_click}</p>
            </>
          )}
          {isViewer && (
            <p className="helper-text">{t.viewer_hint}</p>
          )}
          {isAnonymous && (
            <p className="helper-text">
              <Link to="/auth?mode=login">{t.anon_hint_login}</Link> {t.anon_hint_to_book}
            </p>
          )}

          {/* Информация о комнате: вместимость, оборудование, описание. */}
          <div className="room-info">
            <p><strong>{t.room_capacity}:</strong> {room.capacity}</p>
            {room.equipment && <p><strong>{t.room_equipment}:</strong> {room.equipment}</p>}
            {room.description && <p>{room.description}</p>}
          </div>

          {/* Кнопка редактирования — только для админа. */}
          {isAdmin && (
            <div className="room-admin-actions">
              <Link className="btn btn--small" to={`/admin/rooms/${room.id}/edit`}>{t.room_edit}</Link>
            </div>
          )}
        </div>
      </div>

      {/* ---- Недельный календарь ---- */}
      <h2 className="section-title">{t.room_calendar}</h2>
      {/* Навигация по неделям: стрелки влево/вправо. */}
      <div className="calendar-nav">
        <button type="button" className="btn btn--small" onClick={prevWeek}>&larr;</button>
        {/* Диапазон дат текущей недели. */}
        <span>{weekStart.toLocaleDateString("nn-NO")} &ndash; {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString("nn-NO")}</span>
        <button type="button" className="btn btn--small" onClick={nextWeek}>&rarr;</button>
      </div>
      {/* Легенда компаний — только для тех, кто видит сами компании. */}
      {canWrite && (() => {
        const seen = new Map();
        for (const b of bookings) {
          if (b.company_id && !seen.has(b.company_id)) {
            seen.set(b.company_id, { name: b.company_name, color: b.company_color });
          }
        }
        const legendItems = companies.length > 0
          ? companies.map((c) => [c.id, { name: c.name, color: c.color }])
          : [...seen.entries()];
        if (legendItems.length === 0) return null;
        return (
          <div className="calendar-legend">
            {legendItems.map(([id, c]) => (
              <span key={id} className="calendar-legend__item">
                <span className="calendar-legend__dot" style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </div>
        );
      })()}
      {/* Сетка календаря: дни × часы. */}
      <div className="calendar-grid">
        {/* Заголовок: названия дней недели. */}
        <div className="calendar-grid__header">
          <div className="calendar-grid__corner"></div>
          {weekDays.map((d) => (
            <div key={d.toISOString()} className="calendar-grid__day-label">
              {/* Форматируем: короткий день + число. */}
              {d.toLocaleDateString("nn-NO", { weekday: "short", day: "numeric" })}
            </div>
          ))}
        </div>
        {/* Тело: строка на каждый час с ячейками на каждый день. */}
        <div className="calendar-grid__body">
          {HOURS.map((h) => (
            <div key={h} className="calendar-grid__row">
              {/* Метка часа в левом столбце. */}
              <div className="calendar-grid__hour">{String(h).padStart(2, "0")}:00</div>
              {weekDays.map((d, dayIdx) => {
                const info = slotGrid[`${d.toISOString()}:${h}`];
                const merge = info?.booked ? getMergeFlags(slotGrid, d, h) : null;
                const cellStyle = info?.booked && !info.past && info.color && canWrite
                  ? { background: info.color, borderColor: info.color, color: getContrastText(info.color) }
                  : undefined;
                const cellLabel = info?.booked
                  ? (canWrite ? info.label : t.cell_busy_short)
                  : null;

                // Решаем, как реагировать на ячейку.
                // Drag — только на свободных; Click — везде для создания (или редактирования своих).
                const cellTime = new Date(d); cellTime.setHours(h, 0, 0, 0);
                const cellInPast = cellTime <= new Date();
                const isFree = !info?.booked;

                let onCellClick = null;
                let onCellMouseDown = null;
                let onCellMouseEnter = null;
                let onCellKeyDown = null;
                let cellClickable = false;
                if (canBook && !cellInPast) {
                  if (isFree) {
                    // Свободная ячейка: drag для выделения диапазона, click для 1ч-слота
                    onCellMouseDown = () => handleCellMouseDown(d, h, true, cellInPast);
                    onCellMouseEnter = () => handleCellMouseEnter(d, h);
                    onCellClick = () => {
                      if (suppressNextClickRef.current) return;
                      if (!drag) openCreateModal(d, h);
                    };
                    onCellKeyDown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCreateModal(d, h); } };
                    cellClickable = true;
                  } else if (!info.past) {
                    // Занятая ячейка: своя бронь → редактирование, чужая → создание новой
                    const primary = info.bookings?.[0];
                    const isOwner = primary?.user_id && primary.user_id === user?.id;
                    if (isOwner || isAdmin) {
                      onCellClick = () => openEditModal(primary);
                      onCellKeyDown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditModal(primary); } };
                    } else {
                      // Чужая бронь — клик открывает создание, подставляем свободный gap если есть
                      onCellClick = () => {
                        const gap = findFreeGapInCell(d, h, info.bookings);
                        if (gap) {
                          openCreateModal(d, h, gap.start, gap.end);
                        } else {
                          openCreateModal(d, h);
                        }
                      };
                      onCellKeyDown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCreateModal(d, h); } };
                    }
                    cellClickable = true;
                  }
                }

                const dragSelected = isInDrag(d, h);

                // Прошедшие свободные ячейки — отдельный стиль (светло-серый, не кликабельны)
                const isExpiredFree = cellInPast && isFree;

                return (
                  <div key={d.toISOString() + h}
                    className={`calendar-grid__cell ${info?.booked ? (info.past ? "calendar-grid__cell--past" : "calendar-grid__cell--booked") : ""}${merge ? mergeClassName(merge) : ""}${cellClickable ? " calendar-grid__cell--clickable" : ""}${dragSelected ? " calendar-grid__cell--drag" : ""}${isExpiredFree ? " calendar-grid__cell--expired" : ""}`}
                    style={cellStyle}
                    onMouseDown={onCellMouseDown}
                    onMouseEnter={onCellMouseEnter}
                    onClick={onCellClick}
                    role={cellClickable ? "button" : undefined}
                    tabIndex={cellClickable ? 0 : undefined}
                    onKeyDown={onCellKeyDown}>
                    {cellLabel && <span className={`calendar-grid__label ${info.past ? "calendar-grid__label--past" : ""}`}>{cellLabel}</span>}
                    {/* Tooltip только для авторизованных писателей (user/admin). */}
                    {info?.booked && canWrite && (
                      <div className={`cal-tip${tipPosClass(dayIdx, h)}`} role="tooltip">
                        {info.bookings.map((b, i) => (
                          <div key={b.id || i} className="cal-tip__row">
                            <div className="cal-tip__time">
                              {fmtClock(new Date(b.start_time))} – {fmtClock(new Date(b.end_time))}
                            </div>
                            <div className="cal-tip__user">
                              <strong>{b.user_name || "—"}</strong>
                            </div>
                            {b.company_name && (
                              <div className="cal-tip__company">
                                <span className="cal-tip__dot" style={{ background: b.company_color || "#9ca3af" }} />
                                {b.company_name}
                              </div>
                            )}
                            {(b.guest_first_name || b.guest_last_name || b.guest_description) && (
                              <div className="cal-tip__comment">
                                <strong>{t.tooltip_guest}:</strong>{" "}
                                {[b.guest_first_name, b.guest_last_name].filter(Boolean).join(" ")}
                                {b.guest_description ? ` — ${b.guest_description}` : ""}
                              </div>
                            )}
                            {b.comment && (
                              <div className="cal-tip__comment">{b.comment}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* История + комментарии — только для авторизованных писателей. */}
      {canWrite && (
      <div className="room-bottom">
        {/* Левая половина: история бронирований. */}
        <div className="room-bottom__history">
          <div className="history-header">
            <h2 className="section-title">{t.room_history}</h2>
            <div className="history-sort">
              <button type="button"
                className={`btn btn--tiny ${historySort === "time" ? "btn--active" : ""}`}
                onClick={() => setHistorySort("time")}>{t.room_sort_time}</button>
              <button type="button"
                className={`btn btn--tiny ${historySort === "activity" ? "btn--active" : ""}`}
                onClick={() => setHistorySort("activity")}>{t.room_sort_activity}</button>
              {isAdmin && history.length > 0 && (
                <button type="button"
                  className="btn btn--tiny btn--dark"
                  onClick={handleClearHistory}
                  title={t.admin_history_clear_all}>
                  {t.admin_history_clear_all}
                </button>
              )}
            </div>
          </div>
          {futureBookings.length > 0 && (
            <>
              <h3 className="subsection-title">Komande</h3>
              {futureBookings.map((b) => (
                <div key={b.id} className="history-item">
                  <span>{formatRange(b.start_time, b.end_time)}</span>
                  <span className="history-item__user">
                    <UserAvatar url={b.user_avatar} name={b.user_name} />
                    {b.user_name || "—"}
                  </span>
                  {b.company_name && (
                    <span className="history-item__company">
                      <span className="history-item__company-dot" style={{ background: b.company_color || "#9ca3af" }} />
                      {b.company_name}
                    </span>
                  )}
                  {(b.guest_first_name || b.guest_last_name || b.guest_description) && (
                    <span className="history-item__guest">
                      {t.tooltip_guest}: {[b.guest_first_name, b.guest_last_name].filter(Boolean).join(" ")}
                      {b.guest_description ? ` — ${b.guest_description}` : ""}
                    </span>
                  )}
                  {(b.user_id === user.id || isAdmin) && (
                    <button type="button" className="btn btn--small btn--danger" onClick={() => handleCancel(b.id)}>
                      {t.room_cancel_booking}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
          {isAdmin && pastBookings.length > 0 && (
            <>
              <h3 className="subsection-title">Tidlegare</h3>
              <div className="history-past-list">
                {pastBookings.map((b) => (
                  <div key={b.id} className={`history-item history-item--past ${b.status === "cancelled" ? "history-item--cancelled" : ""}`}>
                    <span>{formatRange(b.start_time, b.end_time)}</span>
                    <span className="history-item__user">
                      <UserAvatar url={b.user_avatar} name={b.user_name} />
                      {b.user_name || "—"}
                    </span>
                    {b.company_name && (
                      <span className="history-item__company">
                        <span className="history-item__company-dot" style={{ background: b.company_color || "#9ca3af" }} />
                        {b.company_name}
                      </span>
                    )}
                    {(b.guest_first_name || b.guest_last_name || b.guest_description) && (
                      <span className="history-item__guest">
                        {t.tooltip_guest}: {[b.guest_first_name, b.guest_last_name].filter(Boolean).join(" ")}
                        {b.guest_description ? ` — ${b.guest_description}` : ""}
                      </span>
                    )}
                    <span className="history-item__status">{b.status}</span>
                    <button type="button"
                      className="btn btn--small btn--neutral"
                      onClick={() => handleDeleteBooking(b.id)}>
                      {t.admin_history_delete_one}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Правая половина: комментарии к комнате. */}
        <div className="room-bottom__comments">
          <h2 className="section-title">{t.room_comments}</h2>
          {/* Форма добавления нового комментария. */}
          <form className="comment-form" onSubmit={handleComment}>
            {/* Поле ввода текста комментария. */}
            <input className="form-input" placeholder={t.room_comment_placeholder} value={commentText}
              onChange={(e) => setCommentText(e.target.value)} />
            {/* Кнопка «Отправить». */}
            <button className="btn btn--primary btn--small" type="submit">{t.room_comment_send}</button>
          </form>
          {/* Список комментариев (новые сверху). */}
          <div className="comments-list">
            {comments.map((c) => (
              <div key={c.id} className="comment-item">
                {/* Заголовок: имя автора, дата, кнопка удаления (для админа). */}
                <div className="comment-item__header">
                  <strong>{c.user_name}</strong>
                  <span className="comment-item__date">{new Date(c.created_at).toLocaleString("nn-NO")}</span>
                  {/* Кнопка удаления комментария — только для админа. */}
                  {isAdmin && (
                    <button type="button" className="btn btn--tiny btn--danger" onClick={() => handleDeleteComment(c.id)}>×</button>
                  )}
                </div>
                {/* Текст комментария. */}
                <p className="comment-item__text">{c.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          text={confirmAction.text}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {bookingModal.open && (
        <BookingModal
          mode={bookingModal.mode}
          room={room}
          booking={bookingModal.booking}
          initialStart={bookingModal.initialStart}
          initialEnd={bookingModal.initialEnd}
          isAdmin={isAdmin}
          currentUserId={user?.id || null}
          token={token}
          onClose={closeBookingModal}
          onSaved={() => loadBookings()}
        />
      )}
    </section>
  );
};
