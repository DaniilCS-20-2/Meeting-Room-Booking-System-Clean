-- Необязательная информация о госте, для которого создаётся бронирование.
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS guest_first_name TEXT,
    ADD COLUMN IF NOT EXISTS guest_last_name TEXT,
    ADD COLUMN IF NOT EXISTS guest_description TEXT;
