CREATE TABLE IF NOT EXISTS appointment_employee_attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id BIGINT UNSIGNED NOT NULL,
  external_staff_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM('No asistió', 'Llegó', 'Corrección') NOT NULL,
  recorded_by_login VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointment_employee_attendance_latest (appointment_id, external_staff_id, id),
  CONSTRAINT fk_appointment_employee_attendance_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_appointment_employee_attendance_staff
    FOREIGN KEY (external_staff_id) REFERENCES external_staff (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
