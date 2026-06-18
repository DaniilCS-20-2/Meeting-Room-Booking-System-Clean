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
  if (count === 0) return { columns: 1, size: "medium" };

  const load = items.reduce((sum, item) => sum + itemVisualWeight(item), 0);
  const rowsPerCol = (cols) => Math.ceil(count / cols);

  let columns = 1;
  if (count >= 10) columns = 3;
  else if (count >= 4) columns = 2;

  const rows = rowsPerCol(columns);
  let size = "medium";

  if (columns === 1) {
    // 1–3 записи: один столбец, компактнее — не раздуваем по центру
    size = load >= 7 ? "small" : count <= 1 ? "small" : "medium";
  } else if (columns === 2) {
    // 4+ записей: два столбца — крупнее, заполняем ширину экрана
    if (count <= 6 && load < 10) size = "xlarge";
    else if (count <= 8 && load < 12) size = "large";
    else size = "medium";
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

const DEFAULT_LOGO_FRAME_BG = "rgba(255, 255, 255, 0.92)";

const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));

const getEdgeMatchedFrameColor = (img) => {
  try {
    const srcW = img.naturalWidth || 0;
    const srcH = img.naturalHeight || 0;
    if (!srcW || !srcH) return DEFAULT_LOGO_FRAME_BG;

    const maxDim = 72;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const w = Math.max(8, Math.round(srcW * scale));
    const h = Math.max(8, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return DEFAULT_LOGO_FRAME_BG;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const points = [];
    const pushPixel = (x, y) => {
      const i = (y * w + x) * 4;
      points.push({
        r: data[i],
        g: data[i + 1],
        b: data[i + 2],
        a: data[i + 3],
      });
    };

    // Берём пиксели только по периметру: так цвет подложки совпадает
    // с кромкой исходного лого-карточки.
    for (let x = 0; x < w; x++) {
      pushPixel(x, 0);
      pushPixel(x, h - 1);
    }
    for (let y = 1; y < h - 1; y++) {
      pushPixel(0, y);
      pushPixel(w - 1, y);
    }

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let sumA = 0;
    for (const p of points) {
      const alpha = p.a / 255;
      if (alpha <= 0.02) continue;
      sumR += p.r * alpha;
      sumG += p.g * alpha;
      sumB += p.b * alpha;
      sumA += alpha;
    }
    if (sumA === 0) return DEFAULT_LOGO_FRAME_BG;

    // Слегка подмешиваем белый, чтобы рамка не выглядела грязно
    // на тёмных/шумных краях исходного логотипа.
    const edgeR = sumR / sumA;
    const edgeG = sumG / sumA;
    const edgeB = sumB / sumA;
    const soften = 0.12;
    const r = clampChannel(edgeR * (1 - soften) + 255 * soften);
    const g = clampChannel(edgeG * (1 - soften) + 255 * soften);
    const b = clampChannel(edgeB * (1 - soften) + 255 * soften);
    return `rgb(${r}, ${g}, ${b})`;
  } catch {
    return DEFAULT_LOGO_FRAME_BG;
  }
};

const TvLogo = ({ companyLogoUrl, companyName }) => {
  const [frameBg, setFrameBg] = useState(DEFAULT_LOGO_FRAME_BG);
  const src = resolveUploadUrl(companyLogoUrl);

  useEffect(() => {
    setFrameBg(DEFAULT_LOGO_FRAME_BG);
  }, [src]);

  return (
    <div className="tv-display__logo-frame" style={{ "--tv-logo-frame-bg": frameBg }}>
      <img
        src={src}
        alt={companyName || ""}
        className="tv-display__logo"
        onLoad={(e) => setFrameBg(getEdgeMatchedFrameColor(e.currentTarget))}
      />
    </div>
  );
};

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
        <TvLogo companyLogoUrl={item.companyLogoUrl} companyName={item.companyName} />
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
