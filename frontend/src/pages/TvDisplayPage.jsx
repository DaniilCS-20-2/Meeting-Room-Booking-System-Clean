import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, resolveUploadUrl } from "../api";
import { t } from "../i18n/labels";

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
  const [dayLabel, setDayLabel] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const bounds = useMemo(() => dayBounds(), []);

  const visibleItems = useMemo(
    () => items.filter((item) => new Date(item.endTime).getTime() > now),
    [items, now]
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
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
    setDayLabel(bounds.start.toLocaleDateString("nn-NO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }));
  }, [bounds.start]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await apiFetch(
          `/display/today?from=${encodeURIComponent(bounds.start.toISOString())}&to=${encodeURIComponent(bounds.end.toISOString())}`
        );
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bounds.start, bounds.end]);

  return (
    <div className="tv-display">
      {previewTransparent && (
        <p className="tv-display__preview-banner">{t.display_preview_hint}</p>
      )}

      <div className="tv-display__content">
      <header className="tv-display__head">
        <p className="tv-display__heading">
          <span className="tv-display__title">{t.display_title}</span>
          {dayLabel && (
            <>
              <span className="tv-display__sep" aria-hidden="true">·</span>
              <span className="tv-display__date">{dayLabel}</span>
            </>
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
              {item.companyLogoUrl ? (
                <img
                  src={resolveUploadUrl(item.companyLogoUrl)}
                  alt=""
                  className="tv-display__logo"
                />
              ) : (
                <span className="tv-display__logo-spacer" aria-hidden="true" />
              )}
              <div className="tv-display__info">
                <span className="tv-display__time">
                  {fmtClock(item.startTime)} – {fmtClock(item.endTime)}
                </span>
                <p className="tv-display__line">
                  <span className="tv-display__room">{item.roomName}</span>
                  {item.guestLabel && (
                    <>
                      <span className="tv-display__dot" aria-hidden="true">·</span>
                      <span className="tv-display__guest">{item.guestLabel}</span>
                    </>
                  )}
                  {item.hostName && (
                    <>
                      <span className="tv-display__dot" aria-hidden="true">·</span>
                      <span className="tv-display__host">{item.hostName}</span>
                    </>
                  )}
                  {item.companyName && (
                    <>
                      <span className="tv-display__dot" aria-hidden="true">·</span>
                      <span className="tv-display__company">{item.companyName}</span>
                    </>
                  )}
                </p>
              </div>
            </li>
        ))}
      </ul>
      </div>
    </div>
  );
};
