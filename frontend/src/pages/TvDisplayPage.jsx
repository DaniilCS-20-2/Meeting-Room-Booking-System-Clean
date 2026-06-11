import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, resolveUploadUrl } from "../api";
import { t } from "../i18n/labels";

const DATA_POLL_MS = 15_000;
const CLOCK_TICK_MS = 15_000;
const PAGE_RELOAD_MS = 10 * 60_000;

/** Оценка «занятости» экрана одной записью (лого, гости, хост = выше). */
const itemVisualWeight = (item) => {
  let w = 1;
  if (item.companyLogoUrl) w += 0.35;
  if (item.guestNames) {
    w += 0.55;
    if (String(item.guestNames).length > 28) w += 0.35;
  }
  if (item.guestNote) w += 0.45;
  if (item.hostName) w += 0.45;
  return w;
};

/** 0 = крупно, 1–2 = компактнее, 3–4 = два столбца. Берём max(по числу, по нагрузке). */
const pickFitTier = (items) => {
  const count = items.length;
  if (count === 0) return 0;

  const load = items.reduce((sum, item) => sum + itemVisualWeight(item), 0);

  const byCount =
    count >= 9 ? 4 :
    count >= 6 ? 3 :
    count >= 5 ? 3 :
    count >= 4 ? 1 : 0;

  const byLoad =
    load >= 11.5 ? 4 :
    load >= 9 ? 3 :
    load >= 7 ? 2 :
    load >= 5.5 ? 1 : 0;

  return Math.max(byCount, byLoad);
};

const fmtClock = (iso) =>
  new Date(iso).toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" });

const dayBounds = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

export const TvDisplayPage = () => {
  const [searchParams] = useSearchParams();
  const previewTransparent = searchParams.get("preview") === "1";

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayKey, setDayKey] = useState(() => new Date().toDateString());
  const [now, setNow] = useState(() => Date.now());

  const bounds = useMemo(() => dayBounds(), [dayKey]);

  const visibleItems = useMemo(
    () => items.filter((item) => new Date(item.endTime).getTime() > now),
    [items, now]
  );

  const fitTier = useMemo(() => pickFitTier(visibleItems), [visibleItems]);

  const dayLabel = useMemo(
    () => bounds.start.toLocaleDateString("nn-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    [bounds.start]
  );

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
      const today = new Date().toDateString();
      setDayKey((prev) => (prev !== today ? today : prev));
    }, CLOCK_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const root = document.getElementById("root");
    document.documentElement.classList.add("tv-display-root");
    document.body.classList.add("tv-display-root");
    root?.classList.add("tv-display-root");
    if (previewTransparent) {
      document.documentElement.classList.add("tv-display-root--preview");
      document.body.classList.add("tv-display-root--preview");
      root?.classList.add("tv-display-root--preview");
    }
    return () => {
      document.documentElement.classList.remove("tv-display-root", "tv-display-root--preview");
      document.body.classList.remove("tv-display-root", "tv-display-root--preview");
      root?.classList.remove("tv-display-root", "tv-display-root--preview");
    };
  }, [previewTransparent]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await apiFetch(
          `/display/today?from=${encodeURIComponent(bounds.start.toISOString())}&to=${encodeURIComponent(bounds.end.toISOString())}&_=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, DATA_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [bounds.start, bounds.end]);

  useEffect(() => {
    const reloadTimer = setInterval(() => window.location.reload(), PAGE_RELOAD_MS);
    return () => clearInterval(reloadTimer);
  }, []);

  const fitClass = fitTier > 0 ? ` tv-display--fit-${fitTier}` : "";

  return (
    <div className={`tv-display${fitClass}`}>
      {previewTransparent && (
        <p className="tv-display__preview-banner">{t.display_preview_hint}</p>
      )}

      <div className="tv-display__content">
        <header className="tv-display__head">
          <p className="tv-display__heading">
            <span className="tv-display__title">{t.display_title}</span>
            {dayLabel && (
              <span className="tv-display__date">{dayLabel}</span>
            )}
          </p>
        </header>

        {loading && <p className="tv-display__empty">{t.display_loading}</p>}

        {!loading && visibleItems.length === 0 && (
          <p className="tv-display__empty">{t.display_empty}</p>
        )}

        <ul className="tv-display__list">
          {visibleItems.map((item) => (
            <li key={item.id} className="tv-display__row">
              <div className="tv-display__brand">
                {item.companyLogoUrl ? (
                  <img
                    src={resolveUploadUrl(item.companyLogoUrl)}
                    alt={item.companyName || ""}
                    className="tv-display__logo"
                  />
                ) : (
                  <span className="tv-display__logo-spacer" aria-hidden="true" />
                )}
              </div>
              <div className="tv-display__info">
                <span className="tv-display__time">
                  {fmtClock(item.startTime)} – {fmtClock(item.endTime)}
                </span>
                <p className="tv-display__room">{item.roomName}</p>
                {(item.guestNames || item.guestNote) && (
                  <div className="tv-display__guest-block">
                    {item.guestNames && (
                      <p className="tv-display__guests">{item.guestNames}</p>
                    )}
                    {item.guestNote && (
                      <p className="tv-display__guest-note">{item.guestNote}</p>
                    )}
                  </div>
                )}
                {item.hostName && (
                  <p className="tv-display__host">{item.hostName}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
