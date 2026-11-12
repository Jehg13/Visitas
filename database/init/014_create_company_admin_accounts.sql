CREATE TABLE IF NOT EXISTS accesos (
  login VARCHAR(255) NOT NULL,
  pswd VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  active VARCHAR(1) NOT NULL DEFAULT 'Y',
  rol_aplicacion ENUM('administrador_empresa', 'recepcion', 'anfitrion', 'sin_acceso')
    NOT NULL DEFAULT 'sin_acceso',
  picture LONGBLOB NULL,
  role VARCHAR(128) NULL,
  phone VARCHAR(64) NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  company_id BIGINT UNSIGNED NOT NULL,
  department_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (login),
  KEY idx_accesos_company_id (company_id),
  KEY idx_accesos_department_id (department_id),
  CONSTRAINT fk_accesos_company
    FOREIGN KEY (company_id) REFERENCES companies (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_accesos_department
    FOREIGN KEY (department_id) REFERENCES departments (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
