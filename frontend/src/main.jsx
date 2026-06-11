// Импортируем React для рендера.
import React from "react";
// Импортируем createRoot API из ReactDOM.
import { createRoot } from "react-dom/client";
// Импортируем корневой компонент приложения.
import App from "./App";
// Импортируем основной CSS-файл с читаемыми стилями интерфейса.
import "./styles/app.css";

// Находим корневой DOM-элемент приложения.
const rootElement = document.getElementById("root");
// Создаём React root и монтируем App.
createRoot(rootElement).render(
  // StrictMode помогает выявлять побочные эффекты в development.
  <React.StrictMode>
    {/* Рендерим основное приложение. */}
    <App />
  </React.StrictMode>
);
