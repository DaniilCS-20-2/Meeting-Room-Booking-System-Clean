// Импортируем React и необходимые хуки.
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
// Импортируем обёртку для API-запросов.
import { apiFetch } from "../api";

// Создаём контекст аутентификации, доступный во всём приложении.
const AuthContext = createContext(null);

// Хук для удобного доступа к контексту аутентификации в компонентах.
export const useAuth = () => useContext(AuthContext);

// Провайдер аутентификации — оборачивает всё приложение, предоставляя данные пользователя.
export const AuthProvider = ({ children }) => {
  // Инициализируем токен из localStorage (сохраняется между сессиями).
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  // Храним данные текущего пользователя (null, пока не загружены).
  const [user, setUser] = useState(null);
  // Флаг загрузки — true, пока проверяем токен при старте.
  const [loading, setLoading] = useState(!!token);
  const loadSeqRef = useRef(0);
  const tokenRef = useRef(token);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Загружаем данные пользователя по токену из API.
  const loadUser = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const tokenAtStart = token;
    // Если токена нет — сбрасываем пользователя и завершаем загрузку.
    if (!tokenAtStart) { setUser(null); setLoading(false); return; }
    try {
      // Запрашиваем данные текущего пользователя через GET /api/auth/me.
      const data = await apiFetch("/auth/me", { token: tokenAtStart });
      // Сохраняем полученные данные в state.
      if (seq !== loadSeqRef.current || tokenAtStart !== tokenRef.current) return;
      setUser(data);
    } catch {
      if (seq !== loadSeqRef.current || tokenAtStart !== tokenRef.current) return;
      // Токен невалидный или просроченный — удаляем его.
      localStorage.removeItem("token");
      // Сбрасываем state токена и пользователя.
      setToken(null);
      setUser(null);
    } finally {
      if (seq !== loadSeqRef.current) return;
      // Завершаем загрузку в любом случае.
      setLoading(false);
    }
  }, [token]);

  // Вызываем loadUser при изменении токена (при старте и после логина/логаута).
  useEffect(() => { loadUser(); }, [loadUser]);

  // Функция логина: отправляет email и пароль, сохраняет токен.
  const login = async (email, password) => {
    // Отправляем POST /api/auth/login с данными формы.
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    // Сохраняем полученный токен в localStorage.
    localStorage.setItem("token", data.token);
    // Обновляем state токена.
    setToken(data.token);
    // Сохраняем данные пользователя из ответа.
    setUser(data.user);
    // Возвращаем данные для использования в компоненте.
    return data;
  };

  const register = async (email, password, displayName, companyId) => {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: { email, password, displayName, companyId: companyId || null },
    });
    return data;
  };

  const verifyEmail = async (pendingToken, code) => {
    const data = await apiFetch("/auth/verify", {
      method: "POST",
      body: { pendingToken, code },
    });
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  // Функция выхода: удаляет токен и сбрасывает данные пользователя.
  const logout = () => {
    // Удаляем токен из localStorage.
    localStorage.removeItem("token");
    // Сбрасываем state токена.
    setToken(null);
    // Сбрасываем данные пользователя.
    setUser(null);
  };

  // Перезагрузка данных пользователя (вызывается после обновления профиля).
  const refreshUser = () => loadUser();

  // Собираем все значения контекста в один объект.
  const value = { user, token, loading, login, register, verifyEmail, logout, refreshUser };

  // Предоставляем контекст всем дочерним компонентам.
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
