import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch, resolveUploadUrl } from "../api";
import { t } from "../i18n/labels";

const DATA_POLL_MS = 15_000;
const CLOCK_TICK_MS = 15_000;
const PAGE_RELOAD_MS = 10 * 60_000;

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

/** columns: 1 | 2 | 3, size: xlarge | large | medium | small */
const computeLayout = (items) => {
  const count = items.length;
  if (count === 0) return { columns: 1, size: "large" };

  const load = items.reduce((sum, item) => sum + itemVisualWeight(item), 0);
  const rowsPerCol = (cols) => Math.ceil(count / cols);

  let columns = 1;
  if (count >= 10 || load >= 12) columns = 3;
  else if (count >= 4 || load >= 5.5) columns = 2;

  const rows = rowsPerCol(columns);
  let size = "large";

  if (columns === 1) {
    size = count <= 2 ? "xlarge" : count <= 3 ? "large" : "medium";
  } else if (columns === 2) {
    if (count <= 6 && load < 9) size = "large";
    else if (rows <= 4 && load < 11) size = "medium";
    else size = "small";
  } else {
    if (rows <= 4 && load < 14) size = "medium";
    else size = "small";
  }

  return { columns, size };
};

const splitColumns = (items, columnCount) => {
  if (columnCount <= 1) return [items];
  const perCol = Math.ceil(items.length / columnCount);
  const cols = [];
  for (let i = 0; i < items.length; i += perCol) {
    cols.push(items.slice(i, i + perCol));
  }
  return cols;
};

const fmtClock = (iso) =>
  new Date(iso).toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" });

/** Имя/фамилия и короткие фразы — без переноса посередине слова. */
const PersonText = ({ text, className, as: Tag = "span" }) => {
  if (!text) return null;
  const parts = String(text).split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 1) {
    return (
      <Tag className={className}>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            <span className="tv-display__person">{part}</span>
            {i < parts.length - 1 ? ", " : null}
          </React.Fragment>
        ))}
      </Tag>
    );
  }
  return (
    <Tag className={className ? `${className} tv-display__person` : "tv-display__person"}>
      {parts[0] || text}
    </Tag>
  );
};

const DisplayRow = ({ item }) => (
  <li className="tv-display__row">
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
      <PersonText text={item.roomName} className="tv-display__room" as="p" />
      {(item.guestNames || item.guestNote) && (
        <div className="tv-display__guest-block">
          {item.guestNames && (
            <PersonText text={item.guestNames} className="tv-display__guests" as="p" />
          )}
          {item.guestNote && (
            <PersonText text={item.guestNote} className="tv-display__guest-note" as="p" />
          )}
        </div>
      )}
      {item.hostName && (
        <PersonText text={item.hostName} className="tv-display__host" as="p" />
      )}
    </div>
  </li>
);

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

  const layout = useMemo(() => computeLayout(visibleItems), [visibleItems]);
  const columnGroups = useMemo(
    () => splitColumns(visibleItems, layout.columns),
    [visibleItems, layout.columns]
  );

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

  return (
    <div
      className="tv-display"
      data-size={layout.size}
      data-cols={layout.columns}
    >
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

        {!loading && visibleItems.length > 0 && (
          <div className="tv-display__grid">
            {columnGroups.map((col, idx) => (
              <ul key={idx} className="tv-display__col">
                {col.map((item) => (
                  <DisplayRow key={item.id} item={item} />
                ))}
              </ul>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
