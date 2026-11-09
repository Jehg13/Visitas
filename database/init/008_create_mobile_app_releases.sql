CREATE TABLE IF NOT EXISTS mobile_app_releases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel ENUM('phone', 'tablet') NOT NULL,
  version VARCHAR(40) NOT NULL,
  build_number INT UNSIGNED NOT NULL,
  notes TEXT NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_filename VARCHAR(80) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_by_login VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mobile_app_releases_channel_build (channel, build_number),
  KEY idx_mobile_app_releases_channel_build (channel, build_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
