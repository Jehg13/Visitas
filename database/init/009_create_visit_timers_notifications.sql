CREATE TABLE IF NOT EXISTS daily_log_timers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  visit_date DATE NOT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  visitor_record_id BIGINT UNSIGNED NULL,
  visit_entry_id BIGINT UNSIGNED NOT NULL,
  person_name VARCHAR(180) NOT NULL,
  phase ENUM('Llegada', 'Ingreso') NOT NULL,
  interval_minutes TINYINT UNSIGNED NOT NULL,
  started_at DATETIME NOT NULL,
  due_at DATETIME NOT NULL,
  status ENUM('active', 'canceled', 'completed') NOT NULL DEFAULT 'active',
  notification_sent_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_daily_log_timers_visit_entry (visit_entry_id),
  KEY idx_daily_log_timers_due (status, due_at, notification_sent_at),
  KEY idx_daily_log_timers_appointment (appointment_id, visit_date, status),
  KEY idx_daily_log_timers_visitor (visitor_record_id, visit_date, status),
  CONSTRAINT fk_daily_log_timers_appointment
    FOREIGN KEY (appointment_id) REFERENCES appointments (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_daily_log_timers_visitor
    FOREIGN KEY (visitor_record_id) REFERENCES general_visitors (id)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_daily_log_timers_visit_entry
    FOREIGN KEY (visit_entry_id) REFERENCES daily_log_entries (id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_login VARCHAR(255) NOT NULL,
  platform ENUM('web', 'mobile') NOT NULL,
  subscription_key CHAR(64) NOT NULL,
  endpoint TEXT NULL,
  p256dh VARCHAR(255) NULL,
  auth_secret VARCHAR(255) NULL,
  fcm_token TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_notification_subscriptions_key (subscription_key),
  KEY idx_notification_subscriptions_user (user_login, platform)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
