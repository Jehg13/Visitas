CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS business_partners (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  rfc VARCHAR(13) NOT NULL,
  category VARCHAR(120) NOT NULL,
  employee_count INT UNSIGNED NOT NULL DEFAULT 0,
  partner_type ENUM('Contratista', 'Proveedor') NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_partners_rfc (rfc),
  KEY idx_business_partners_name (name),
  KEY idx_business_partners_type_active (partner_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS general_visitors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(180) NOT NULL,
  curp CHAR(18) NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_general_visitors_curp (curp),
  KEY idx_general_visitors_full_name (full_name),
  KEY idx_general_visitors_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS external_staff (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_partner_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  phone VARCHAR(30) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_external_staff_business_partner_id (business_partner_id),
  KEY idx_external_staff_full_name (full_name),
  CONSTRAINT fk_external_staff_business_partner
    FOREIGN KEY (business_partner_id) REFERENCES business_partners (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visitor_record_id BIGINT UNSIGNED NULL,
  business_partner_id BIGINT UNSIGNED NULL,
  visit_date DATE NOT NULL,
  visit_time TIME NOT NULL,
  visitor_name VARCHAR(180) NOT NULL,
  visitor_email VARCHAR(254) NOT NULL DEFAULT '',
  reference_code CHAR(8) NOT NULL,
  registered_by VARCHAR(180) NOT NULL,
  created_by_login VARCHAR(255) NULL,
  company_name VARCHAR(180) NOT NULL DEFAULT '',
  host_name VARCHAR(180) NOT NULL,
  status ENUM('Dentro', 'En proceso', 'Pendiente', 'Retirado', 'Cancelada')
    NOT NULL DEFAULT 'Pendiente',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_visit_date_time (visit_date, visit_time),
  KEY idx_appointments_status (status),
  KEY idx_appointments_created_by_login (created_by_login),
  UNIQUE KEY uq_appointments_reference_code (reference_code),
  KEY idx_appointments_visitor_record_id (visitor_record_id),
  KEY idx_appointments_business_partner_id (business_partner_id),
  CONSTRAINT fk_appointments_general_visitor
    FOREIGN KEY (visitor_record_id) REFERENCES general_visitors (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_appointments_business_partner
    FOREIGN KEY (business_partner_id) REFERENCES business_partners (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS equipment_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  quantity INT UNSIGNED NOT NULL,
  product VARCHAR(180) NOT NULL,
  brand VARCHAR(120) NOT NULL DEFAULT '',
  model VARCHAR(120) NOT NULL DEFAULT '',
  serial_number VARCHAR(180) NOT NULL DEFAULT '',
  color VARCHAR(80) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_equipment_records_product (product),
  KEY idx_equipment_records_serial_number (serial_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS daily_log_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entry_date DATE NOT NULL,
  entry_time TIME NOT NULL,
  event_type ENUM('Llegada', 'Ingreso', 'Retiro', 'Observaciones') NOT NULL,
  person_name VARCHAR(180) NOT NULL,
  recorded_by_login VARCHAR(255) NULL,
  recorded_by_name VARCHAR(255) NULL,
  details TEXT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  external_staff_id BIGINT UNSIGNED NULL,
  visitor_record_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_daily_log_entries_date_time (entry_date, entry_time),
  KEY idx_daily_log_entries_event_type (event_type),
  KEY idx_daily_log_entries_appointment_id (appointment_id),
  KEY idx_daily_log_entries_external_staff_id (external_staff_id),
  KEY idx_daily_log_entries_visitor_record_id (visitor_record_id),
  CONSTRAINT fk_daily_log_entries_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_daily_log_entries_external_staff
    FOREIGN KEY (external_staff_id) REFERENCES external_staff (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_daily_log_entries_visitor
    FOREIGN KEY (visitor_record_id) REFERENCES general_visitors (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS accesos (
  login VARCHAR(255) NOT NULL,
  pswd VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  active VARCHAR(1) NULL,
  activation_code VARCHAR(32) NULL,
  priv_admin VARCHAR(1) NULL,
  mfa VARCHAR(255) NULL,
  picture LONGBLOB NULL,
  role VARCHAR(128) NULL,
  phone VARCHAR(64) NULL,
  pswd_last_updated TIMESTAMP NULL,
  mfa_last_updated TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS accesos_secciones (
  login VARCHAR(255) NOT NULL,
  seccion ENUM('recepcion', 'anfitriones', 'administrador') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (login, seccion),
  KEY idx_accesos_secciones_seccion (seccion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_login_failures (
  principal_hash CHAR(64) NOT NULL,
  source_hash CHAR(64) NOT NULL,
  failed_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (principal_hash, source_hash),
  KEY idx_auth_login_failures_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS auth_recovery_limits (
  rate_key CHAR(64) NOT NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  window_started_at DATETIME NOT NULL,
  last_attempt_at DATETIME NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rate_key),
  KEY idx_auth_recovery_limits_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  login VARCHAR(255) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
  KEY idx_password_reset_tokens_login_expiry (login, expires_at),
  KEY idx_password_reset_tokens_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE accesos_secciones
  MODIFY seccion ENUM('recepcion', 'anfitriones', 'administrador') NOT NULL;
