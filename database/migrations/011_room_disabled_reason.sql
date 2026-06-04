-- Причина, почему комната временно недоступна/на обслуживании.
ALTER TABLE rooms
    ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
