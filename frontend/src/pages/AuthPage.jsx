import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiFetch } from "../api";
import { t } from "../i18n/labels";

export const AuthPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, login, register, verifyEmail } = useAuth();

  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", displayName: "", companyId: "" });
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [verifyStep, setVerifyStep] = useState(false);
  const [pendingToken, setPendingToken] = useState("");
  const [code, setCode] = useState("");
  const [companies, setCompanies] = useState([]);

  const [forgotStep, setForgotStep] = useState(null); // null | "request" | "reset"
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  useEffect(() => {
    const m = searchParams.get("mode");
    if (m === "login" || m === "register") setMode(m);
  }, [searchParams]);

  useEffect(() => {
    // Загружаем список компаний для селекта при регистрации (публичный эндпоинт).
    apiFetch("/companies").then(setCompanies).catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        await login(form.email, form.password);
        navigate("/");
      } else {
        const data = await register(form.email, form.password, form.displayName, form.companyId || null);
        if (data.verificationRequired) {
          setPendingToken(data.pendingToken);
          setVerifyStep(true);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await verifyEmail(pendingToken, code);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/password/forgot", {
        method: "POST",
        body: { email: forgotEmail },
      });
      setForgotStep("reset");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotReset = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/password/reset", {
        method: "POST",
        body: { email: forgotEmail, code: forgotCode, newPassword: forgotNewPassword },
      });
      setForgotStep(null);
      setForgotCode("");
      setForgotNewPassword("");
      setMode("login");
      setForm((prev) => ({ ...prev, email: forgotEmail, password: "" }));
      setInfo(t.auth_forgot_success);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (verifyStep) {
    return (
      <>
        <nav className="top-nav">
          <Link className="home-btn home-btn--ghost" to="/">{t.nav_home}</Link>
        </nav>
        <section className="page page--narrow">
          <h1 className="page__title">{t.auth_verify_title}</h1>
          <p className="helper-text">{t.auth_verify_hint}</p>
          {error && <p className="error-text">{error}</p>}
          <form className="form-card" onSubmit={handleVerify}>
            <label className="form-label">
              Kode
              <input className="form-input" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required disabled={loading} />
            </label>
            <button className="btn btn--primary btn--full" type="submit" disabled={loading}>
              {loading ? t.auth_loading : t.auth_verify_btn}
            </button>
          </form>
        </section>
      </>
    );
  }

  if (forgotStep) {
    return (
      <>
        <nav className="top-nav">
          <Link className="home-btn home-btn--ghost" to="/">{t.nav_home}</Link>
        </nav>
        <section className="page page--narrow">
          <h1 className="page__title">{t.auth_forgot_title}</h1>
          <p className="helper-text">{t.auth_forgot_hint}</p>
          {error && <p className="error-text">{error}</p>}

          {forgotStep === "request" && (
            <form className="form-card" onSubmit={handleForgotRequest}>
              <label className="form-label">
                {t.auth_email}
                <input
                  className="form-input"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="namn@example.com"
                  required
                  disabled={loading}
                />
              </label>
              <button className="btn btn--primary btn--full" type="submit" disabled={loading}>
                {loading ? t.auth_loading : t.auth_forgot_send}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--full"
                onClick={() => { setForgotStep(null); setError(""); }}
                disabled={loading}
              >
                {t.auth_back_to_login}
              </button>
            </form>
          )}

          {forgotStep === "reset" && (
            <form className="form-card" onSubmit={handleForgotReset}>
              <label className="form-label">
                {t.profile_code}
                <input
                  className="form-input"
                  value={forgotCode}
                  onChange={(e) => setForgotCode(e.target.value)}
                  maxLength={6}
                  required
                  disabled={loading}
                />
              </label>
              <label className="form-label">
                {t.auth_forgot_new_password}
                <input
                  className="form-input"
                  type="password"
                  value={forgotNewPassword}
                  onChange={(e) => setForgotNewPassword(e.target.value)}
                  minLength={6}
                  required
                  disabled={loading}
                />
              </label>
              <button className="btn btn--primary btn--full" type="submit" disabled={loading}>
                {loading ? t.auth_loading : t.auth_forgot_reset}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--full"
                onClick={() => { setForgotStep(null); setError(""); }}
                disabled={loading}
              >
                {t.auth_back_to_login}
              </button>
            </form>
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <nav className="top-nav">
        <Link className="home-btn home-btn--ghost" to="/">{t.nav_home}</Link>
      </nav>
      <section className="page page--narrow">
        <h1 className="page__title">{t.auth_title}</h1>

        <div className="button-row">
          <button type="button" onClick={() => setMode("login")}
            className={`btn ${mode === "login" ? "btn--primary" : ""}`}>
            {t.auth_login}
          </button>
          <button type="button" onClick={() => setMode("register")}
            className={`btn ${mode === "register" ? "btn--primary" : ""}`}>
            {t.auth_register}
          </button>
        </div>

        {error && <p className="error-text">{error}</p>}
        {info && <p className="helper-text">{info}</p>}

        <form className="form-card" onSubmit={handleSubmit}>
          {mode === "register" && (
            <label className="form-label">
              {t.auth_name}
              <input className="form-input" name="displayName" value={form.displayName} onChange={handleChange} disabled={loading} />
            </label>
          )}
          <label className="form-label">
            {t.auth_email}
            <input className="form-input" type="email" name="email" value={form.email} onChange={handleChange} placeholder="namn@example.com" required disabled={loading} />
          </label>
          <label className="form-label">
            {t.auth_password}
            <input className="form-input" type="password" name="password" value={form.password} onChange={handleChange} required disabled={loading} />
          </label>
          {mode === "register" && companies.length > 0 && (
            <label className="form-label">
              {t.auth_company}
              <select
                className="form-input"
                name="companyId"
                value={form.companyId}
                onChange={handleChange}
                required
                disabled={loading}
              >
                <option value="">{t.auth_company_placeholder}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
          )}
          <button className="btn btn--primary btn--full" type="submit" disabled={loading}>
            {loading
              ? t.auth_loading
              : (mode === "login" ? t.auth_submit_login : t.auth_submit_register)}
          </button>
          {mode === "login" && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setForgotStep("request");
                setForgotEmail(form.email);
                setError("");
                setInfo("");
              }}
              disabled={loading}
            >
              {t.auth_forgot}
            </button>
          )}
        </form>
      </section>
    </>
  );
};
