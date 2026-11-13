CREATE TABLE IF NOT EXISTS visitor_kiosk_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  pairing_code_id BIGINT UNSIGNED NULL,
  device_name VARCHAR(120) NOT NULL,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revoked_at DATETIME NULL,
  last_seen_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_visitor_kiosk_devices_pairing_code (pairing_code_id),
  UNIQUE KEY uq_visitor_kiosk_devices_token_hash (token_hash),
  KEY idx_visitor_kiosk_devices_company (company_id, revoked_at),
  CONSTRAINT fk_visitor_kiosk_devices_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_visitor_kiosk_devices_pairing_code
    FOREIGN KEY (pairing_code_id) REFERENCES visitor_kiosk_pairing_codes (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
