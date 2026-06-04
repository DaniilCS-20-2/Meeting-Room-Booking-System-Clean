# Развёртывание в Microsoft Azure (с временными кредитами)

Пошаговая инструкция: один **Web App** (сайт + API) + **PostgreSQL**.  
Портал: [Azure Portal](https://portal.azure.com/#home)

После деплоя адрес будет вида: `https://ferma-booking.azurewebsites.net`  
Infoskjermen: `https://ВАШ-САЙТ.azurewebsites.net/display`

---

## 1. Подготовка на компьютере

```powershell
cd C:\FERMA\FERMA\IT\frontend
npm install
npm run build

cd ..\backend
npm install
```

Сборка кладёт frontend в `backend/public/`.

---

## 2. База данных PostgreSQL

1. В [Azure Portal](https://portal.azure.com) → **Create a resource** → **Azure Database for PostgreSQL Flexible Server**
2. Регион: ближайший (например North Europe)
3. **Compute**: Burstable, B1ms (дешевле для кредитов)
4. Запомните логин/пароль админа
5. **Networking** → разрешите доступ с Azure services + при необходимости ваш IP
6. После создания: **Databases** → создайте БД `booking_app_db`

### Миграции

Подключитесь к БД (Query editor в Azure или `psql`) и выполните **по порядку** все файлы из `database/migrations/`:

`001_init.sql` … `013_company_logo.sql` (и `002_seed.sql` если нужны тестовые данные).

Строка подключения:

```
postgresql://USER:PASSWORD@HOST:5432/booking_app_db?sslmode=require
```

---

## 3. Web App (Node.js)

1. **Create a resource** → **Web App**
2. **Publish**: Code
3. **Runtime**: Node 20 LTS
4. **OS**: Linux
5. **Region**: тот же, что у БД
6. **Plan**: Basic B1 (стабильнее Free; кредиты покроют)

### Application settings (Configuration → Environment variables)

| Имя | Значение |
|-----|----------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | строка PostgreSQL выше |
| `JWT_SECRET` | случайная строка **32+** символов |
| `ADMIN_EMAILS` | ваш email (станет admin) |
| `SMTP_USER` / `SMTP_PASS` | Gmail app password (опционально) |
| `FRONTEND_URL` | `https://ВАШ-САЙТ.azurewebsites.net` |

`WEBSITE_HOSTNAME` Azure подставит сам — для CORS используется `FRONTEND_URL`.

### Порт

Azure сам задаёт `PORT` — менять не нужно.

---

## 4. Загрузка кода

### Вариант A — ZIP (проще)

```powershell
cd C:\FERMA\FERMA\IT
.\scripts\azure-pack.ps1
```

В Portal: Web App → **Deployment Center** → ZIP Deploy → загрузите `azure-deploy.zip`.

### Вариант B — GitHub (рекомендуется)

Код заливается в GitHub; при каждом push в `main` GitHub Actions собирает frontend и деплоит папку `backend/`.

#### 1. Репозиторий

```powershell
cd C:\FERMA\FERMA\IT
git remote add origin https://github.com/ВАШ-ЛОГИН/ВАШ-РЕПО.git
git push -u origin main
```

#### 2. Publish profile → секрет GitHub

1. Azure Portal → ваш **Web App** → **Get publish profile** (скачать XML)
2. GitHub → репозиторий → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. Имя: `AZURE_WEBAPP_PUBLISH_PROFILE`, значение: **весь** текст скачанного файла

#### 3. Имя приложения в workflow

В `.github/workflows/azure-webapp.yml` замените `AZURE_WEBAPP_NAME` на имя Web App (как в Portal, без `.azurewebsites.net`).

#### 4. Настройки Web App

**Startup Command** (Configuration → General settings):

```
node src/server.js
```

Переменные окружения — как в разделе 3 (`DATABASE_URL`, `JWT_SECRET`, …).

#### 5. Первый деплой

После push в `main` откройте вкладку **Actions** в GitHub — job **Deploy to Azure Web App** должен завершиться зелёным.

> **Deployment Center в Portal:** можно подключить GitHub там, но тогда выберите **GitHub Actions** и не перезаписывайте workflow, если уже используете файл из репозитория. Встроенный деплой без сборки frontend **не подойдёт** — нужен наш workflow (сборка `frontend` → `backend/public`).

ZIP (вариант A) по-прежнему можно использовать для разовой загрузки без GitHub.

---

## 5. Проверка

- `https://ВАШ-САЙТ.azurewebsites.net/health` → `{"status":"ok"}`
- Главная страница открывается
- `/display` — календарь TV
- `/display?preview=1` — шахматка = прозрачный фон

---

## 6. Infoskjermen

В [Infoskjermen](https://infoskjermen.no): oppslag **Nettside** → URL:

```
https://ВАШ-САЙТ.azurewebsites.net/display
```

Без `?preview=1`.

---

## Важно про файлы (лого, фото)

Папка `backend/uploads/` на App Service **может очищаться** при перезапуске.  
Для production позже: Azure Blob Storage. На старте с кредитами — достаточно для теста.

---

## Стоимость кредитов (ориентир)

- PostgreSQL B1ms + Web App Basic ≈ **25–45 €/мес**
- Следите: Portal → **Cost Management** → Credits remaining
