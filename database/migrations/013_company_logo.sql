-- Логотип компании для infoskjerm / коридорного TV.
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS company_logo_snapshot TEXT;

-- Заполняем snapshot для существующих броней.
UPDATE bookings b
SET company_logo_snapshot = c.logo_url
FROM users u
JOIN companies c ON c.id = u.company_id
WHERE u.id = b.user_id
  AND b.company_logo_snapshot IS NULL
  AND c.logo_url IS NOT NULL;

-- Триггер: копируем logo_url компании при создании брони.
CREATE OR REPLACE FUNCTION fill_booking_snapshots()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.user_id IS NOT NULL THEN
        SELECT u.display_name, u.email, c.name, c.color, c.logo_url
          INTO NEW.user_name_snapshot,
               NEW.user_email_snapshot,
               NEW.company_name_snapshot,
               NEW.company_color_snapshot,
               NEW.company_logo_snapshot
          FROM users u
          LEFT JOIN companies c ON c.id = u.company_id
         WHERE u.id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
