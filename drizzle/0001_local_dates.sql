ALTER TABLE shifts ALTER COLUMN date TYPE date USING date::date, ALTER COLUMN start_time TYPE time USING start_time::time, ALTER COLUMN end_time TYPE time USING end_time::time;
ALTER TABLE assignments ALTER COLUMN date TYPE date USING date::date, ALTER COLUMN start_time TYPE time USING start_time::time, ALTER COLUMN end_time TYPE time USING end_time::time;
ALTER TABLE credentials ALTER COLUMN expires_at TYPE date USING expires_at::date;
ALTER TABLE cancellations ALTER COLUMN date TYPE date USING date::date;
ALTER TABLE timesheets ALTER COLUMN start_time TYPE timestamp without time zone USING start_time::timestamp without time zone, ALTER COLUMN end_time TYPE timestamp without time zone USING end_time::timestamp without time zone;
ALTER TABLE shifts ADD CONSTRAINT different_shift_times CHECK(start_time<>end_time);
ALTER TABLE timesheets ADD CONSTRAINT valid_timesheet_hours CHECK(end_time>start_time AND end_time-start_time<=interval '24 hours' AND total_minutes=(extract(epoch FROM (end_time-start_time))/60)::integer-break_minutes);
