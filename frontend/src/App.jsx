// Импортируем React для JSX-синтаксиса.
import React from "react";
// Импортируем компоненты маршрутизации из React Router DOM.
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
// Импортируем провайдер и хук аутентификации.
import { AuthProvider, useAuth } from "./context/AuthContext";
import { resolveUploadUrl } from "./api";
// Импортируем все страницы приложения.
import { HomePage } from "./pages/HomePage";
import { AuthPage } from "./pages/AuthPage";
import { RoomPage } from "./pages/RoomPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AdminRoomPage } from "./pages/AdminRoomPage";
import { AdminUsersPage } from "./pages/AdminUsersPage";
import { OverviewCalendarPage } from "./pages/OverviewCalendarPage";
import { TvDisplayPage } from "./pages/TvDisplayPage";
// Импортируем объект переводов (Nynorsk).
import { t } from "./i18n/labels";

// Компонент аватара с выпадающим меню (настройки, выход).
const AvatarMenu = () => {
  // Получаем данные пользователя и функцию выхода из контекста.
  const { user, logout } = useAuth();
  // Получаем функцию навигации для программных переходов.
  const navigate = useNavigate();
  // Локальный state для открытия/закрытия выпадающего меню.
  const [open, setOpen] = React.useState(false);

  // Если пользователь не авторизован, не рендерим аватар.
  if (!user) return null;

  // Берём первую букву имени (или email) для отображения в кружке аватара.
  const initials = (user.display_name || user.email || "U").charAt(0).toUpperCase();

  // Рендерим кнопку-аватар и выпадающее меню.
  return (
    <div className="avatar-menu">
      {/* Кнопка аватара — при клике переключаем видимость меню. */}
      <button type="button" className="avatar-menu__btn" onClick={() => setOpen(!open)}>
        {/* Если есть URL аватара — показываем фото, иначе — инициалы. */}
        {user.avatar_url
          ? <img src={resolveUploadUrl(user.avatar_url)} alt="" className="avatar-menu__img" />
          : <span className="avatar-menu__initials">{initials}</span>}
      </button>
      {/* Выпадающее меню отображается только при open === true. */}
      {open && (
        <div className="avatar-menu__dropdown">
          {/* Кнопка «Настройки» — переход на страницу профиля. */}
          <button type="button" onClick={() => { setOpen(false); navigate("/profile"); }}>
            {t.nav_settings}
          </button>
          {/* Кнопка «Выход» — очищаем токен и переходим на главную. */}
          <button type="button" onClick={() => { setOpen(false); logout(); navigate("/"); }}>
            {t.nav_logout}
          </button>
        </div>
      )}
    </div>
  );
};

// Основной layout приложения — навигация + маршруты.
const AppLayout = () => {
  // Получаем текущий путь для условного рендеринга навигации.
  const location = useLocation();
  // Получаем данные пользователя и флаг загрузки.
  const { user, loading } = useAuth();
  // Определяем, находимся ли на странице авторизации.
  const isAuth = location.pathname === "/auth";
  const isCalendar = location.pathname === "/calendar";
  const isDisplay = location.pathname === "/display";

  // Показываем индикатор загрузки, пока проверяем токен.
  if (loading) return <div className="page">Lastar...</div>;

  return (
    <>
      {/* Навигация скрыта на auth и fullscreen-календаре. */}
      {!isAuth && !isCalendar && !isDisplay && (
        <nav className="top-nav">
          <Link className="home-btn home-btn--ghost" to="/">{t.nav_home}</Link>
          <div className="top-nav__right">
            {!user && (
              <>
                <Link className="home-btn home-btn--ghost" to="/auth?mode=login">{t.home_login_btn}</Link>
                <Link className="home-btn home-btn--primary" to="/auth?mode=register">{t.home_register_btn}</Link>
              </>
            )}
            {user && user.role === "admin" && (
              <>
                <Link className="home-btn home-btn--primary home-btn--icon-only" to="/admin/rooms/new" title={t.room_add} aria-label={t.room_add}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{marginRight: 4, verticalAlign: "middle"}}>
                    <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span className="home-btn__label">{t.room_add}</span>
                </Link>
                <Link className="home-btn home-btn--ghost home-btn--icon-only" to="/admin/users" title={t.room_manage_users} aria-label={t.room_manage_users}>
                  <svg width="18" height="16" viewBox="0 0 24 20" fill="currentColor" style={{marginRight: 4, verticalAlign: "middle"}}>
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                  </svg>
                  <span className="home-btn__label">{t.room_manage_users}</span>
                </Link>
              </>
            )}
            <AvatarMenu />
          </div>
        </nav>
      )}

      {/* Определяем маршруты приложения. */}
      <Routes>
        {/* Главная страница — доступна всем. */}
        <Route path="/" element={<HomePage />} />
        {/* Страница авторизации (логин/регистрация) — доступна всем. */}
        <Route path="/auth" element={<AuthPage />} />
        {/* Страница комнаты — публично (анонимы видят read-only календарь). */}
        <Route path="/rooms/:roomId" element={<RoomPage />} />
        <Route path="/calendar" element={<OverviewCalendarPage />} />
        <Route path="/display" element={<TvDisplayPage />} />
        {/* Страница профиля — только для авторизованных пользователей. */}
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        {/* Создание новой комнаты — только для админов. */}
        <Route path="/admin/rooms/new" element={<AdminRoute><AdminRoomPage /></AdminRoute>} />
        {/* Редактирование комнаты — только для админов. */}
        <Route path="/admin/rooms/:roomId/edit" element={<AdminRoute><AdminRoomPage /></AdminRoute>} />
        {/* Управление пользователями — только для админов. */}
        <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
        {/* Любой неизвестный маршрут — редирект на главную. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
};

// Компонент-обёртка для защищённых маршрутов (только для авторизованных).
const ProtectedRoute = ({ children }) => {
  // Получаем пользователя и флаг загрузки из контекста.
  const { user, loading } = useAuth();
  // Пока идёт проверка токена — ничего не рендерим.
  if (loading) return null;
  // Если пользователь не авторизован — перенаправляем на логин.
  if (!user) return <Navigate to="/auth?mode=login" replace />;
  // Если авторизован — рендерим дочерний компонент.
  return children;
};

// Компонент-обёртка для админских маршрутов (только для пользователей с ролью admin).
const AdminRoute = ({ children }) => {
  // Получаем пользователя и флаг загрузки из контекста.
  const { user, loading } = useAuth();
  // Пока идёт проверка токена — ничего не рендерим.
  if (loading) return null;
  // Если пользователь не авторизован — перенаправляем на логин.
  if (!user) return <Navigate to="/auth?mode=login" replace />;
  // Если роль не admin — перенаправляем на главную.
  if (user.role !== "admin") return <Navigate to="/" replace />;
  // Если админ — рендерим дочерний компонент.
  return children;
};

// Корневой компонент приложения.
const App = () => (
  // BrowserRouter — обёртка для работы с URL-адресами в браузере.
  <BrowserRouter>
    {/* AuthProvider предоставляет контекст аутентификации всему дереву. */}
    <AuthProvider>
      {/* AppLayout содержит навигацию и маршруты. */}
      <AppLayout />
    </AuthProvider>
  </BrowserRouter>
);

// Экспортируем корневой компонент по умолчанию.
export default App;
