CREATE TABLE IF NOT EXISTS visitor_kiosk_pairing_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id BIGINT UNSIGNED NOT NULL,
  code_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_by_login VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  redeemed_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_visitor_kiosk_pairing_codes_hash (code_hash),
  KEY idx_visitor_kiosk_pairing_codes_company_created (company_id, created_at),
  KEY idx_visitor_kiosk_pairing_codes_expiry (expires_at, redeemed_at, revoked_at),
  CONSTRAINT fk_visitor_kiosk_pairing_codes_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
