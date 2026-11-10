DELETE FROM notification_subscriptions
WHERE platform = 'web';

ALTER TABLE notification_subscriptions
  MODIFY platform ENUM('mobile') NOT NULL;
