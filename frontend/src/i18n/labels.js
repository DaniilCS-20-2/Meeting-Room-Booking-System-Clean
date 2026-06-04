// Словарь меток интерфейса — только Nynorsk (норвежский ню-норск).
// Используется для i18n: все тексты UI берутся из этого объекта.
export const t = {
  // ============= Навигация =============
  nav_home: "Hovudside",                     // Главная страница.
  nav_login: "Logg inn",                     // Кнопка входа.
  nav_register: "Registrer",                 // Кнопка регистрации.
  nav_profile: "Profil",                     // Профиль пользователя.
  nav_admin_rooms: "Administrer rom",        // Админ: управление комнатами.
  nav_admin_users: "Administrer brukarar",   // Админ: управление пользователями.
  nav_logout: "Logg ut",                     // Выход из аккаунта.
  nav_settings: "Innstillingar",             // Настройки (в выпадающем меню).

  // ============= Главная страница (незарегистрированный) =============
  home_welcome: "Velkommen til Moteromsbooking",  // Приветственный заголовок.
  home_info: "Book moterom enkelt og raskt. Logg inn eller registrer deg for a kome i gang.",  // Краткое описание сервиса.
  home_login_btn: "Logg inn",                // Кнопка входа на главной.
  home_register_btn: "Registrer deg",        // Кнопка регистрации на главной.

  // ============= Главная страница (авторизованный) =============
  home_title: "Moterom",                     // Заголовок секции комнат.
  home_overview_calendar: "Felles kalender", // Заголовок общего календаря на главной.
  room_free: "Ledig",                        // Статус: комната свободна.
  room_busy: "Opptatt",                      // Статус: комната занята.
  room_disabled: "Vedlikehald",              // Статус: комната на обслуживании.
  room_capacity: "Kapasitet",                // Метка: вместимость комнаты.
  room_free_at: "Ledig kl.",                 // Текст: «Свободна с...».
  room_busy_at: "Opptatt fraa kl.",          // Текст: «Занята с...».
  room_add: "Legg til rom",                  // Кнопка: добавить комнату (админ).
  room_edit: "Rediger",                      // Кнопка: редактировать комнату.
  room_delete: "Slett",                      // Кнопка: удалить комнату.
  room_manage_users: "Brukaradministrasjon", // Кнопка: управление пользователями.

  // ============= Страница авторизации =============
  auth_title: "Innlogging og registrering",  // Заголовок страницы авторизации.
  auth_login: "Logg inn",                    // Вкладка: логин.
  auth_register: "Registrer",                // Вкладка: регистрация.
  auth_email: "E-post",                      // Метка: электронная почта.
  auth_password: "Passord",                  // Метка: пароль.
  auth_name: "Namn",                         // Метка: имя (при регистрации).
  auth_domain_hint: "E-post maa vere fraa tillaten domene (t.d. ferma.no).",  // Подсказка: допустимый домен.
  auth_submit_login: "Logg inn",             // Кнопка отправки: логин.
  auth_submit_register: "Opprett konto",     // Кнопка отправки: регистрация.
  auth_verify_title: "Stadfest e-post",      // Заголовок: подтверждение email.
  auth_verify_hint: "Skriv inn 6-sifra koden sendt til e-posten din.",  // Подсказка: введите код.
  auth_verify_btn: "Stadfest",               // Кнопка: подтвердить.
  auth_forgot: "Gløymt passord?",            // Ссылка: забыли пароль.
  auth_forgot_title: "Tilbakestill passord", // Заголовок: сброс пароля.
  auth_forgot_hint: "Skriv inn e-posten din, og vi sender ein 6-sifra kode.",
  auth_forgot_send: "Send kode",             // Кнопка: отправить код.
  auth_forgot_new_password: "Nytt passord",  // Метка: новый пароль.
  auth_forgot_reset: "Tilbakestill",         // Кнопка: сбросить.
  auth_forgot_success: "Passordet er tilbakestilt. Logg inn med det nye passordet.",
  auth_back_to_login: "Tilbake til innlogging",
  auth_loading: "Vent litt...",

  // ============= Страница комнаты =============
  room_details: "Romdetaljar",               // Заголовок: детали комнаты.
  room_book_btn: "Bestill",                  // Кнопка: забронировать.
  room_next_free: "Ledige tider",            // Метка: ближайшие свободные слоты.
  room_pick_time: "Vel tid",                 // Метка: выбрать время.
  room_from: "Fraa",                         // Метка: «От» (начало бронирования).
  room_to: "Til",                            // Метка: «До» (окончание бронирования).
  room_description: "Skildring",             // Метка: описание.
  room_equipment: "Utstyr",                  // Метка: оборудование.
  room_calendar: "Kalender",                 // Заголовок: календарь.
  room_history: "Historikk",                 // Заголовок: история бронирований.
  room_comments: "Kommentarar",              // Заголовок: комментарии.
  room_cancel_booking: "Avbestill",          // Кнопка: отменить бронирование.
  room_comment_placeholder: "Skriv ein kommentar...",
  room_comment_send: "Send",
  room_back: "Tilbake",
  room_sort_time: "Tid",
  room_sort_activity: "Aktivitet",
  admin_history_delete_one: "Slett",
  admin_history_clear_all: "Tøm historikk",
  admin_history_confirm_delete_one: "Slette denne oppføringa frå historikken for alltid?",
  admin_history_confirm_clear_all: "Slette alle tidlegare og avlyste bookingar for dette rommet? Aktive, komande bookingar blir ikkje rørt.",

  // ============= Страница профиля =============
  profile_title: "Profil",                   // Заголовок: профиль.
  profile_name: "Namn",                      // Метка: имя.
  profile_email: "E-post",                   // Метка: email (только чтение).
  profile_avatar: "Profilbilete",            // Метка: фото профиля.
  profile_change_password: "Endra passord",  // Заголовок: смена пароля.
  profile_current_password: "Noeverande passord",  // Метка: текущий пароль.
  profile_new_password: "Nytt passord",      // Метка: новый пароль.
  profile_save: "Lagre",
  profile_logout: "Logg ut",
  profile_code_hint: "Vi har sendt ein stadfestingskode til e-posten din.",
  profile_code: "Stadfestingskode",
  profile_confirm: "Stadfest",
  profile_change_email: "Endre e-post",
  profile_new_email: "Ny e-post",
  profile_password_for_email: "Passord for stadfesting",

  // ============= Админ: страница комнаты =============
  admin_room_title_new: "Nytt rom",          // Заголовок: создание новой комнаты.
  admin_room_title_edit: "Rediger rom",      // Заголовок: редактирование комнаты.
  admin_room_name: "Romnamn",                // Метка: название комнаты.
  admin_room_location: "Plassering",         // Метка: локация.
  admin_room_capacity: "Kapasitet",          // Метка: вместимость.
  admin_room_description: "Skildring",       // Метка: описание.
  admin_room_equipment: "Utstyr",            // Метка: оборудование.
  admin_room_photo: "Bilete-URL",            // Метка: URL фотографии.
  admin_room_color: "Farge",
  admin_room_color_pick: "Vel farge",
  admin_room_color_reset: "Tilbakestill",
  admin_room_min: "Min. booking (min)",
  admin_room_max: "Maks. booking (min)",
  admin_room_no_limit: "Inga grense",
  room_duration_hint_min: "Minimum",
  room_duration_hint_max: "Maksimum",
  room_duration_hint_min_unit: "min",
  admin_room_save: "Lagre rom",              // Кнопка: сохранить комнату.
  admin_room_disable: "Deaktiver rom",       // Кнопка: отключить комнату.
  admin_room_enable: "Aktiver rom",          // Кнопка: включить комнату.
  admin_room_disabled_reason: "Kvifor er rommet ute av drift?",
  admin_room_disabled_reason_placeholder: "Til dømes: projektoren er øydelagd, vedlikehald, reinhald...",
  room_unavailable_title: "Rommet er mellombels ute av drift",
  room_unavailable_default: "Dette rommet kan ikkje bookast akkurat no.",

  // ============= Админ: страница пользователей =============
  admin_users_title: "Brukaradministrasjon", // Заголовок: управление пользователями.
  admin_users_name: "Namn",                  // Метка: имя пользователя.
  admin_users_email: "E-post",               // Метка: email пользователя.
  admin_users_role: "Rolle",                 // Метка: роль пользователя.
  admin_users_edit: "Rediger",               // Кнопка: редактировать.
  admin_users_delete: "Slett",               // Кнопка: удалить.
  admin_users_save: "Lagre",                 // Кнопка: сохранить.
  admin_users_change_avatar: "Klikk for å endre profilbilete",
  admin_users_change_avatar_short: "Endre",

  // ============= Админ: whitelist =============
  admin_whitelist_title: "Godkjende e-postar",
  admin_whitelist_hint: "Berre e-postar på denne lista kan registrere seg.",
  admin_whitelist_email: "E-post",
  admin_whitelist_role: "Rolle",
  admin_whitelist_add: "Legg til",
  admin_whitelist_remove: "Fjern",
  admin_whitelist_empty: "Ingen e-postar i lista.",
  admin_whitelist_role_user: "Brukar",
  admin_whitelist_role_admin: "Admin",
  admin_whitelist_role_viewer: "Berre lese",

  // ============= Booking-kommentar / tooltip =============
  room_comment_label: "Skildring",
  room_comment_placeholder_book: "Kva skal møtet handle om? (valfritt)",
  booking_guest_title: "Gjest (valfritt)",
  booking_guest_names: "Namn på gjest(ar)",
  booking_guest_names_placeholder: "Til dømes: Ola Nordmann, Kari Hansen",
  booking_guest_description: "Skildring av gjest",
  booking_guest_description_placeholder: "Til dømes: ekstern kunde, besøksbehov, telefonnummer...",
  tooltip_guest: "Gjest",
  tooltip_user: "Brukar",
  tooltip_company: "Selskap",
  tooltip_comment: "Skildring",
  cell_busy_short: "Opptatt",
  viewer_hint: "Du har berre lesetilgang.",
  room_book_hint_click: "Klikk på ein ledig rute i kalenderen for å booka. Klikk på di eiga booking for å redigera.",
  anon_hint_login: "Logg inn",
  anon_hint_to_book: "for å booka rommet.",

  // ============= Компании (selskap) =============
  auth_company: "Selskap",
  auth_company_placeholder: "Vel selskap",
  admin_users_company: "Selskap",
  admin_companies_title: "Selskap",
  admin_companies_hint: "Legg til, endre eller fjern selskap. Farge og logo vert brukt i kalender og på infoskjerm.",
  admin_companies_name: "Namn",
  admin_companies_color: "Farge",
  admin_companies_add: "Legg til",
  admin_companies_remove: "Fjern",
  admin_companies_save: "Lagre",
  admin_companies_empty: "Ingen selskap enno.",
  admin_companies_change_color: "Endre farge",
  admin_companies_pick_color: "Vel farge",
  admin_companies_logo: "Logo",
  admin_companies_add_logo: "Last opp logo",
  admin_companies_change_logo: "Endre logo",
  admin_companies_display_url: "Infoskjerm-URL",
  admin_companies_display_preview_url: "Førehandsvis transparent bakgrunn",
  company_none: "Utan selskap",

  // ============= Korridor-TV / infoskjerm =============
  display_title: "Møter i dag",
  display_loading: "Lastar…",
  display_empty: "Ingen møter i dag.",
  display_with: "med",
  display_preview_hint: "Førehandsvising: grå ruter = transparent bakgrunn. I Infoskjermen bruk /display utan ?preview=1.",

  // ============= Booking-modal =============
  modal_title_create: "Ny booking",
  modal_title_edit: "Rediger booking",
  modal_save_btn: "Lagra",
  modal_cancel_btn: "Avbryt",
  modal_update_btn: "Lagra endring",
  modal_cancel_series_btn: "Avbestill heile serien",
  modal_edit_end_hint: "Du kan endra sluttida (korta ned eller forlenga viss ledig).",
  modal_original_end: "Opprinneleg slutt",
  modal_recurring_toggle: "Gjentakande møte",
  modal_recurring_hint: "Vel ukedagar — start- og sluttid blir tatt frå feltene over.",
  modal_recurring_until: "Til og med",
  modal_confirm_create_title: "Bekreft booking",
  modal_confirm_create_text: "Vil du opprette denne bookinga?",
  modal_confirm_series_title: "Opprett serie",
  modal_confirm_series_text: "Dette opprettar fleire bookingar i serien. Halde fram?",
  modal_confirm_update_title: "Oppdater booking",
  modal_confirm_update_text: "Vil du oppdatera bookinga til ny sluttid?",
  modal_confirm_cancel_title: "Avbestill booking",
  modal_confirm_cancel_text: "Er du sikker på at du vil avbestille denne bookinga?",
  modal_confirm_cancel_series_title: "Avbestill serie",
  modal_confirm_cancel_series_text: "Avbestille alle framtidige bookingar i denne serien?",
  modal_series_created_partial: "Serien oppretta: {created} bookingar. {skipped} tidspunkt var opptatt og vart hoppa over.",
};
