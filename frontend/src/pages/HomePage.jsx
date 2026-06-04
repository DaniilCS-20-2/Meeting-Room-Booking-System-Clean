// Импортируем React и необходимые хуки.
import React, { useEffect, useState } from "react";
// Импортируем Link для навигации.
import { Link } from "react-router-dom";
// Импортируем хук аутентификации для проверки статуса пользователя.
import { useAuth } from "../context/AuthContext";
// Импортируем обёртку для API-запросов к backend.
import { apiFetch, resolveUploadUrl } from "../api";
import { t } from "../i18n/labels";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { OverviewCalendar } from "../components/OverviewCalendar";

// Главная страница приложения.
export const HomePage = () => {
  // Получаем данные пользователя и токен из контекста.
  const { user, token } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [confirmAction, setConfirmAction] = useState(null);

  // Загружаем список комнат — публично, токен опционален.
  useEffect(() => {
    apiFetch("/rooms", { token }).then(setRooms).catch(() => {});
  }, [token]);

  // Аноним = неавторизованный посетитель. Видит карточки комнат и базовый
  // статус «занято/свободно», но не имена и не админские действия.
  const isAnonymous = !user;
  // Признак админа — для отображения админских кнопок.
  const isAdmin = !!user && user.role === "admin";
  const handleDelete = (roomId, roomName) => {
    setConfirmAction({
      title: "Slett rom",
      text: `Er du sikker på at du vil slette «${roomName}»? Alle bookingar blir sletta.`,
      action: async () => {
        try {
          await apiFetch(`/rooms/${roomId}`, { method: "DELETE", token });
          setRooms((prev) => prev.filter((r) => r.id !== roomId));
        } catch (err) {
          alert(err.message);
        }
        setConfirmAction(null);
      },
    });
  };

  return (
    <section className="home-page page">
      {/* Заголовок: для анонима — приветствие, для залогиненных — секция комнат. */}
      <h1 className="home-page__title">
        {isAnonymous ? t.home_welcome : t.home_title}
      </h1>
      {isAnonymous && (
        <p className="home-page__subtitle">{t.home_info}</p>
      )}

      {/* Сетка карточек комнат. */}
      <div className="home-grid">
        {/* Перебираем массив комнат и рендерим карточку для каждой. */}
        {rooms.map((room) => {
          // Определяем текущий статус комнаты (занята/свободна/отключена).
          const isBusy = room.computed_status === "opptatt";
          const isOff = room.computed_status === "vedlikehald";
          // Выбираем CSS-класс для цветной рамки карточки.
          let borderClass = "home-card--free"; // Зелёная рамка по умолчанию.
          if (isBusy) borderClass = "home-card--busy"; // Красная рамка.
          if (isOff) borderClass = "home-card--disabled"; // Серая рамка.

          let nearestText = "";
          if (room.nearest_event) {
            const d = new Date(room.nearest_event.time);
            const dateStr = d.toLocaleDateString("nn-NO", { day: "numeric", month: "short" });
            const timeStr = d.toLocaleTimeString("nn-NO", { hour: "2-digit", minute: "2-digit" });
            nearestText = room.nearest_event.type === "free_at"
              ? `${t.room_free} ${dateStr} kl. ${timeStr}`
              : `${t.room_busy} ${dateStr} kl. ${timeStr}`;
          }

          return (
            <div key={room.id} className={`home-card ${borderClass}`}>
              {/* Кликабельная ссылка на страницу комнаты. */}
              <Link to={`/rooms/${room.id}`} className="home-card__link">
                {/* Фото комнаты или пустой placeholder. */}
                {(() => {
                  const cover = (room.photos && room.photos[0]) || room.photo_url;
                  if (!cover) return <div className="home-card__media" />;
                  return <img src={resolveUploadUrl(cover)} alt={room.name} className="home-card__media-img" />;
                })()}
                {/* Название комнаты. */}
                <h3 className="home-card__title">{room.name}</h3>
                {/* Краткое описание. */}
                <p className="home-card__text">{room.description}</p>
                {/* Вместимость и оборудование. */}
                <p className="home-card__meta">
                  {t.room_capacity}: {room.capacity}
                  {room.equipment ? ` · ${room.equipment}` : ""}
                </p>
                {/* Текст ближайшего события (если есть). */}
                {nearestText && <p className="home-card__nearest">{nearestText}</p>}
                {isOff && (
                  <p className="home-card__nearest">
                    {room.disabled_reason || t.room_unavailable_default}
                  </p>
                )}
              </Link>
              {/* Кнопки редактирования/удаления — только для админа. */}
              {isAdmin && (
                <div className="home-card__admin">
                  {/* Кнопка «Rediger» ведёт на страницу редактирования комнаты. */}
                  <Link className="btn btn--small" to={`/admin/rooms/${room.id}/edit`}>{t.room_edit}</Link>
                  {/* Кнопка «Slett» удаляет комнату с подтверждением. */}
                  <button type="button" className="btn btn--small btn--danger" onClick={() => handleDelete(room.id, room.name)}>{t.room_delete}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Общий календарь по всем комнатам — под карточками комнат.
          Аноним/viewer видят только занятость и название комнаты;
          user/admin — ещё и человека, селскап и описание. */}
      <OverviewCalendar
        token={token}
        canSeeDetails={!!user && user.role !== "viewer"}
        showFullscreenButton
      />

      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          text={confirmAction.text}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </section>
  );
};
