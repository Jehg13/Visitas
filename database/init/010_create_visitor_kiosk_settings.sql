CREATE TABLE IF NOT EXISTS visitor_kiosk_settings (
  id TINYINT UNSIGNED NOT NULL,
  auto_authorize_public_visitors BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO visitor_kiosk_settings (id, auto_authorize_public_visitors)
VALUES (1, FALSE);
