CREATE TABLE IF NOT EXISTS equipment_declarations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  business_partner_id BIGINT UNSIGNED NOT NULL,
  external_staff_id BIGINT UNSIGNED NULL,
  visitor_record_id BIGINT UNSIGNED NULL,
  appointment_id BIGINT UNSIGNED NULL,
  person_name VARCHAR(180) NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  status ENUM('Pendiente', 'Enviada') NOT NULL DEFAULT 'Pendiente',
  token_hash CHAR(64) NOT NULL,
  token_expires_at DATETIME NOT NULL,
  token_revoked_at DATETIME NULL,
  submitted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_equipment_declarations_token_hash (token_hash),
  UNIQUE KEY uq_equipment_declarations_appointment (appointment_id),
  KEY idx_equipment_declarations_partner_date (business_partner_id, created_at),
  KEY idx_equipment_declarations_person (person_name),
  KEY idx_equipment_declarations_status (status),
  CONSTRAINT fk_equipment_declarations_partner
    FOREIGN KEY (business_partner_id) REFERENCES business_partners (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_equipment_declarations_staff
    FOREIGN KEY (external_staff_id) REFERENCES external_staff (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_equipment_declarations_visitor
    FOREIGN KEY (visitor_record_id) REFERENCES general_visitors (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_equipment_declarations_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS equipment_declaration_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  declaration_id BIGINT UNSIGNED NOT NULL,
  item_type ENUM('Equipo', 'Herramienta') NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  product VARCHAR(180) NOT NULL,
  brand VARCHAR(120) NOT NULL DEFAULT '',
  model VARCHAR(120) NOT NULL DEFAULT '',
  serial_number VARCHAR(180) NOT NULL DEFAULT '',
  color VARCHAR(80) NOT NULL DEFAULT '',
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_equipment_declaration_items_declaration (declaration_id),
  CONSTRAINT fk_equipment_declaration_items_declaration
    FOREIGN KEY (declaration_id) REFERENCES equipment_declarations (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS equipment_inspections (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  declaration_id BIGINT UNSIGNED NOT NULL,
  phase ENUM('Entrada', 'Salida') NOT NULL,
  status ENUM('En progreso', 'Completada') NOT NULL DEFAULT 'En progreso',
  inspector_login VARCHAR(255) NOT NULL,
  inspector_name VARCHAR(255) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_equipment_inspections_phase (declaration_id, phase),
  CONSTRAINT fk_equipment_inspections_declaration
    FOREIGN KEY (declaration_id) REFERENCES equipment_declarations (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS equipment_inspection_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id BIGINT UNSIGNED NOT NULL,
  declaration_item_id BIGINT UNSIGNED NOT NULL,
  declared_item_type ENUM('Equipo', 'Herramienta') NOT NULL,
  declared_quantity INT UNSIGNED NOT NULL,
  declared_product VARCHAR(180) NOT NULL,
  declared_brand VARCHAR(120) NOT NULL DEFAULT '',
  declared_model VARCHAR(120) NOT NULL DEFAULT '',
  declared_serial_number VARCHAR(180) NOT NULL DEFAULT '',
  declared_color VARCHAR(80) NOT NULL DEFAULT '',
  checked_quantity INT UNSIGNED NOT NULL DEFAULT 0,
  checked_product VARCHAR(180) NOT NULL DEFAULT '',
  checked_brand VARCHAR(120) NOT NULL DEFAULT '',
  checked_model VARCHAR(120) NOT NULL DEFAULT '',
  checked_serial_number VARCHAR(180) NOT NULL DEFAULT '',
  checked_color VARCHAR(80) NOT NULL DEFAULT '',
  result ENUM('Pendiente', 'Conforme', 'Incidencia') NOT NULL DEFAULT 'Pendiente',
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  checked_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_equipment_inspection_items_item (inspection_id, declaration_item_id),
  CONSTRAINT fk_equipment_inspection_items_inspection
    FOREIGN KEY (inspection_id) REFERENCES equipment_inspections (id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_equipment_inspection_items_declaration_item
    FOREIGN KEY (declaration_item_id) REFERENCES equipment_declaration_items (id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
