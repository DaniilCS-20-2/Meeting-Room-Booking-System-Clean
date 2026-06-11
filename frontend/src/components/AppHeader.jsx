import React from "react";

/** Шапка с белой зоной под статус-бар на телефоне. */
export const AppHeader = ({ children }) => (
  <header className="app-header">
    <div className="app-header__inset" aria-hidden="true" />
    {children}
  </header>
);
