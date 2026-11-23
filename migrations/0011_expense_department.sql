ALTER TABLE expenses ADD COLUMN department TEXT NOT NULL DEFAULT 'general'
  CHECK (department IN ('general', 'rooms', 'restaurant_bar', 'hall'));
CREATE INDEX expenses_department_idx ON expenses (department, spent_on);
