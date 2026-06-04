// Большой общий календарь на главной — недельный обзор по всем комнатам.
// Цвет ячейки = цвет комнаты (детерминированно от id), при ховере — список
// бронирований на этом часу с указанием комнаты, пользователя и компании.
// Для анонима/viewer персональные поля не приходят с сервера, поэтому
// в read-only режиме мы рисуем нейтрально-серые ячейки с текстом «Opptatt».
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { t } from "../i18n/labels";
import {
  chunkMergeClassName,
  getRoomChunkMergeFlags,
} from "../utils/calendarMerge";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Стартовая дата текущей недели (понедельник, 00:00).
const startOfWeek = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // getDay(): 0=Sunday ... 6=Saturday. В нн-NO неделя начинается с понедельника.
  const dow = d.getDay();
  const diff = (dow === 0 ? -6 : 1 - dow);
  d.setDate(d.getDate() + diff);
  return d;
};

const buildWeekGrid = (start) => {
  const days = [];
  const d = new Date(start);
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    days.push(day);
  }
  return days;
};

// Палитра, из которой берём цвет комнаты по детерминированному хешу.
// Ровно 10 «дружелюбных» оттенков, разнесённых по тону, чтобы соседние
// комнаты редко получали похожий цвет.
const ROOM_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b",
];

const colorForRoom = (key) => {
  const s = String(key || "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return ROOM_PALETTE[h % ROOM_PALETTE.length];
};

// Контрастный текст для произвольного HEX (Rec. 601).
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

const fmtClock = (d) => d.toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" });

export const OverviewCalendar = ({
  token,
  canSeeDetails = false,
  showFullscreenButton = false,
  fullscreen = false,
}) => {
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => startOfWeek());
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    const from = weekStart.toISOString();
    const to = new Date(weekStart.getTime() + 7 * 86400000).toISOString();
    apiFetch(`/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token })
      .then(setBookings)
      .catch(() => setBookings([]));
  }, [weekStart, token]);

  const weekDays = useMemo(() => buildWeekGrid(weekStart), [weekStart]);

  const slotGrid = useMemo(() => {
    const grid = {};
    for (const d of weekDays) {
      for (const h of HOURS) {
        const slotStart = new Date(d);
        slotStart.setHours(h, 0, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 3600000);
        const overlapping = bookings.filter((b) => {
          const bs = new Date(b.start_time).getTime();
          const be = new Date(b.end_time).getTime();
          return slotStart.getTime() < be && slotEnd.getTime() > bs;
        });

        const key = `${d.toISOString()}:${h}`;
        if (!overlapping.length) {
          grid[key] = null;
          continue;
        }

        const byRoom = new Map();
        for (const b of overlapping) {
          const roomKey = b.room_id;
          if (!byRoom.has(roomKey)) {
            byRoom.set(roomKey, {
              roomId: b.room_id,
              roomName: b.room_name,
              color: b.room_color || colorForRoom(b.room_id),
              bookings: [],
            });
          }
          byRoom.get(roomKey).bookings.push(b);
        }
        const rooms = [...byRoom.values()].sort((a, b) => a.roomName.localeCompare(b.roomName));
        const allPast = overlapping.every((b) => new Date(b.end_time) <= new Date());
        grid[key] = { rooms, allBookings: overlapping, past: allPast };
      }
    }
    return grid;
  }, [bookings, weekDays]);

  // Уникальный список комнат (для легенды). Цвет = админский room_color, fallback — хэш.
  const roomLegend = useMemo(() => {
    const map = new Map();
    for (const b of bookings) {
      if (b.room_id && !map.has(b.room_id)) {
        map.set(b.room_id, {
          id: b.room_id,
          name: b.room_name,
          color: b.room_color || colorForRoom(b.room_id),
        });
      }
    }
    return [...map.values()];
  }, [bookings]);

  // Группируем пересекающиеся брони по комнатам, чтобы в одном часовом слоте
  // отображать ВСЕ занятые комнаты рядом (а не только самую раннюю).
  const slotInfo = (day, hour) => slotGrid[`${day.toISOString()}:${hour}`] || null;

  const prevWeek = () => setWeekStart(new Date(weekStart.getTime() - 7 * 86400000));
  const nextWeek = () => setWeekStart(new Date(weekStart.getTime() + 7 * 86400000));

  // Адаптивное позиционирование тултипа: на нижних часах — вверх, на крайних
  // колонках — прижимаем к ближайшему краю, чтобы тултип не вылезал за сетку.
  const tipPosClass = (dayIdx, hour) => {
    let cls = "";
    // Чем ниже ячейка, тем выше «опасность» обрезаться снизу. Тултип в общем
    // календаре может быть высоким (несколько комнат × несколько броней),
    // поэтому переключаем направление уже с середины суток.
    if (hour >= 12) cls += " cal-tip--up";
    if (dayIdx >= 5) cls += " cal-tip--align-right";
    else if (dayIdx <= 1) cls += " cal-tip--align-left";
    return cls;
  };

  return (
    <section className={`overview-cal ${fullscreen ? "overview-cal--fullscreen" : ""}`}>
      <div className="overview-cal__head">
        {!fullscreen && (
          <h2 className="section-title overview-cal__title">{t.home_overview_calendar}</h2>
        )}
        <div className="overview-cal__actions">
          <div className="calendar-nav">
            <button type="button" className="btn btn--small" onClick={prevWeek}>&larr;</button>
            <span>
              {weekStart.toLocaleDateString("nn-NO")} &ndash;{" "}
              {new Date(weekStart.getTime() + 6 * 86400000).toLocaleDateString("nn-NO")}
            </span>
            <button type="button" className="btn btn--small" onClick={nextWeek}>&rarr;</button>
          </div>
          {showFullscreenButton && (
            <button
              type="button"
              className="btn btn--small overview-cal__fullscreen-btn"
              onClick={() => navigate("/calendar")}
              title="Opne fullskjerm-kalender"
              aria-label="Opne fullskjerm-kalender"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M9 20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M12 17V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {roomLegend.length > 0 && (
        <div className="calendar-legend">
          {roomLegend.map((r) => (
            <span key={r.id} className="calendar-legend__item">
              <span className="calendar-legend__dot" style={{ background: r.color }} />
              {r.name}
            </span>
          ))}
        </div>
      )}

      <div className="calendar-grid calendar-grid--overview">
        <div className="calendar-grid__header">
          <div className="calendar-grid__corner"></div>
          {weekDays.map((d) => (
            <div key={d.toISOString()} className="calendar-grid__day-label">
              {d.toLocaleDateString("nn-NO", { weekday: "short", day: "numeric" })}
            </div>
          ))}
        </div>
        <div className="calendar-grid__body">
          {HOURS.map((h) => (
            <div key={h} className="calendar-grid__row">
              <div className="calendar-grid__hour">{String(h).padStart(2, "0")}:00</div>
              {weekDays.map((d, dayIdx) => {
                const info = slotInfo(d, h);
                // Проверяем, прошло ли время ячейки (для свободных — серый фон)
                const cellTime = new Date(d);
                cellTime.setHours(h, 0, 0, 0);
                const isExpired = !info && cellTime <= new Date();

                return (
                  <div
                    key={d.toISOString() + h}
                    className={`calendar-grid__cell overview-cal__cell ${info ? (info.past ? "calendar-grid__cell--past" : "calendar-grid__cell--booked") : ""}${isExpired ? " calendar-grid__cell--expired" : ""}`}
                  >
                    {info && (
                      <div className="overview-cal__chunks">
                        {info.rooms.map((r) => {
                          const color = r.color;
                          const chunkMerge = getRoomChunkMergeFlags(slotGrid, d, h, r.roomId);
                          const chunkStyle = info.past
                            ? undefined
                            : { background: color, color: getContrastText(color) };
                          return (
                            <button
                              key={r.roomId}
                              type="button"
                              className={`overview-cal__chunk ${info.past ? "overview-cal__chunk--past" : ""}${chunkMergeClassName(chunkMerge)}`}
                              style={chunkStyle}
                              onClick={(e) => { e.stopPropagation(); navigate(`/rooms/${r.roomId}`); }}
                              aria-label={r.roomName}
                            >
                              <span className="overview-cal__chunk-label">{r.roomName}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {info && canSeeDetails && (
                      <div className={`cal-tip${tipPosClass(dayIdx, h)}`} role="tooltip">
                        {info.allBookings.map((b, i) => (
                          <div key={b.id || i} className="cal-tip__row">
                            <div className="cal-tip__time">
                              {fmtClock(new Date(b.start_time))} – {fmtClock(new Date(b.end_time))}
                            </div>
                            <div className="cal-tip__user"><strong>{b.room_name}</strong></div>
                            {b.user_name && <div className="cal-tip__user">{b.user_name}</div>}
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
                            {b.comment && <div className="cal-tip__comment">{b.comment}</div>}
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
    </section>
  );
};
