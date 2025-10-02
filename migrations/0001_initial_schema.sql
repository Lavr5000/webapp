-- Таблица заявок на изменение документации
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  user_name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  audio_file_url TEXT,
  transcribed_text TEXT,
  category TEXT, -- срочность, тип изменения, раздел документации
  urgency_level INTEGER DEFAULT 2, -- 1-срочно, 2-обычно, 3-низкий приоритет
  change_type TEXT, -- тип изменения (исправление ошибок, дополнение, корректировка)
  doc_section TEXT, -- раздел документации
  status TEXT DEFAULT 'новая' CHECK (status IN ('новая', 'на_рассмотрении', 'одобрена', 'отклонена', 'в_работе', 'завершена')),
  is_approved BOOLEAN DEFAULT FALSE,
  admin_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_user_id TEXT UNIQUE NOT NULL,
  telegram_username TEXT,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'manager')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Таблица объединенных писем
CREATE TABLE IF NOT EXISTS letters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  request_ids TEXT NOT NULL, -- JSON массив ID заявок
  status TEXT DEFAULT 'черновик' CHECK (status IN ('черновик', 'на_согласовании', 'подписан', 'отправлен')),
  manager_comment TEXT,
  signed_at DATETIME,
  sent_at DATETIME,
  recipient_email TEXT,
  created_by INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Таблица логов email отправки
CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  letter_id INTEGER,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('отправлено', 'ошибка', 'в_очереди')),
  error_message TEXT,
  sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (letter_id) REFERENCES letters(id)
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_requests_telegram_user_id ON requests(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);
CREATE INDEX IF NOT EXISTS idx_users_telegram_user_id ON users(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_letters_status ON letters(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);