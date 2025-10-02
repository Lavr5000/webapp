# Система управления заявками на изменение проектной документации

## Обзор проекта

**Цель**: Полнофункциональная система для автоматизации процесса подачи, обработки и согласования заявок на изменение проектной документации с интеграцией Telegram Bot API и Google Gemini 2.5 Pro.

**Технологии**: Hono Framework + Cloudflare Pages + TypeScript + Google Gemini API + Telegram Bot API

## 🌐 Публичные URL

- **Приложение**: https://3000-inppnmd1qw1wn0wxxe2ne-6532622b.e2b.dev
- **Административная панель**: https://3000-inppnmd1qw1wn0wxxe2ne-6532622b.e2b.dev/admin
- **Страница согласования**: https://3000-inppnmd1qw1wn0wxxe2ne-6532622b.e2b.dev/manager
- **Health Check API**: https://3000-inppnmd1qw1wn0wxxe2ne-6532622b.e2b.dev/api/health

## 📊 Архитектура данных

### База данных (Cloudflare D1)
- **requests** - Заявки на изменения (ID, пользователь, текст, категория, статус)
- **users** - Пользователи системы (Telegram ID, имя, роль)
- **letters** - Объединенные письма для отправки заказчику  
- **email_logs** - Логи отправки писем

### Интеграции
- **Google Gemini 2.5 Pro** - Анализ и классификация заявок, объединение в письма
- **Telegram Bot API** - Прием заявок через бот
- **Email API** - Отправка писем (SendGrid/Resend)

## 🚀 Текущие функции

### ✅ Реализованные компоненты

#### 1. API Backend (Hono Framework)
- **GET/POST/PUT /api/requests** - Управление заявками
- **POST /api/telegram/webhook** - Telegram Bot webhook
- **POST /api/gemini/analyze** - Анализ заявок через Gemini
- **POST /api/gemini/combine** - Объединение заявок в письма
- **GET/POST /api/letters** - Управление письмами
- **POST /api/email/send-letter** - Отправка email

#### 2. Веб-интерфейсы
- **Главная страница** (/) - Обзор системы и навигация
- **Админ панель** (/admin) - Управление заявками и их обработка
- **Страница согласования** (/manager) - Подписание и отправка писем

#### 3. Telegram Bot интеграция
- Прием текстовых и голосовых сообщений
- Автоматическая регистрация пользователей
- Уведомления администраторов о новых заявках
- Команды: /start, /help, /status, /info

#### 4. Google Gemini 2.5 Pro AI
- Автоматический анализ заявок (категория, срочность, тип изменения)
- Классификация по разделам документации
- Объединение заявок в структурированные письма
- Улучшение текста писем

#### 5. Email система
- Поддержка SendGrid и Resend API
- Форматирование писем в HTML
- Логирование отправки
- Тестовая отправка

### 📋 Workflow системы

1. **Подача заявки** → Пользователь отправляет сообщение в Telegram бот
2. **Анализ AI** → Gemini автоматически классифицирует заявку
3. **Рассмотрение** → Администратор просматривает в веб-панели
4. **Одобрение** → Администратор одобряет нужные заявки  
5. **Объединение** → Система создает письмо из одобренных заявок
6. **Согласование** → Руководитель подписывает письмо
7. **Отправка** → Письмо автоматически отправляется заказчику

## 🔧 Настройка для production

### 1. Переменные окружения (.dev.vars для разработки)
```bash
# Google AI Studio API Key
GOOGLE_GENERATIVE_AI_API_KEY=your-google-ai-studio-api-key

# Telegram Bot Token (создать через @BotFather)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Email API (SendGrid или Resend)
EMAIL_API_KEY=your-email-api-key
EMAIL_FROM=noreply@your-domain.com

# Telegram Webhook URL
TELEGRAM_WEBHOOK_URL=https://your-app.pages.dev/api/telegram/webhook
```

### 2. Создание Telegram бота
1. Напишите @BotFather в Telegram
2. Выполните команду `/newbot`
3. Дайте название боту: "Изменение проектной документации"
4. Выберите username: например `doc_changes_bot`
5. Скопируйте токен в переменную `TELEGRAM_BOT_TOKEN`

### 3. Настройка Google Gemini API
1. Перейдите в [Google AI Studio](https://aistudio.google.com/)
2. Создайте API ключ
3. Добавьте ключ в переменную `GOOGLE_GENERATIVE_AI_API_KEY`

### 4. Настройка Email API

#### Вариант A: SendGrid
1. Зарегистрируйтесь на [SendGrid](https://sendgrid.com/)
2. Создайте API ключ (начинается с `SG.`)
3. Верифицируйте домен или email отправителя

#### Вариант B: Resend  
1. Зарегистрируйтесь на [Resend](https://resend.com/)
2. Создайте API ключ (начинается с `re_`)
3. Добавьте домен

### 5. Развертывание на Cloudflare Pages

```bash
# Настройка API ключа Cloudflare
setup_cloudflare_api_key

# Создание D1 базы данных
npx wrangler d1 create webapp-production

# Применение миграций
npx wrangler d1 migrations apply webapp-production --local  # для локального тестирования
npx wrangler d1 migrations apply webapp-production          # для production

# Добавление тестовых данных (опционально)
npx wrangler d1 execute webapp-production --local --file=./seed.sql

# Сборка и деплой
npm run build
npx wrangler pages deploy dist --project-name webapp

# Настройка секретов в production
npx wrangler pages secret put GOOGLE_GENERATIVE_AI_API_KEY --project-name webapp
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name webapp
npx wrangler pages secret put EMAIL_API_KEY --project-name webapp
npx wrangler pages secret put EMAIL_FROM --project-name webapp
```

### 6. Настройка Telegram webhook
После деплоя установите webhook для бота:

```bash
# Через API или веб-интерфейс
POST /api/telegram/set-webhook
{
  "url": "https://your-app.pages.dev/api/telegram/webhook"
}
```

## 📱 Использование системы

### Для инженеров (пользователи)
1. Найдите бота в Telegram по username
2. Отправьте `/start` для регистрации
3. Опишите необходимые изменения в документации
4. Получите уведомление о статусе заявки

### Для администраторов
1. Откройте `/admin` панель
2. Просмотрите новые заявки
3. Одобрите нужные заявки
4. Создайте письмо из одобренных заявок

### Для руководителей
1. Откройте `/manager` страницу
2. Просмотрите письма на согласовании
3. Подпишите или отклоните письма
4. Отправьте подписанные письма заказчику

## 🔒 Безопасность

- Авторизация пользователей через Telegram OAuth
- Система ролей (user/admin/manager)  
- Безопасное хранение API ключей в Cloudflare secrets
- Валидация входящих данных
- Логирование всех операций

## 🎯 Следующие шаги развития

1. **Расширенная авторизация** - OAuth интеграция, 2FA
2. **Файловые вложения** - Поддержка документов и изображений
3. **Уведомления** - Email уведомления, push notifications
4. **Отчетность** - Аналитика, экспорт данных в Excel
5. **Мобильное приложение** - PWA или нативное приложение

## 🛠 Разработка

### Локальный запуск
```bash
# Установка зависимостей
npm install

# Сборка проекта
npm run build

# Запуск локального сервера с D1
npm run dev:d1

# Применение миграций локально
npm run db:migrate:local

# Добавление тестовых данных
npm run db:seed
```

### Структура проекта
```
webapp/
├── src/
│   ├── index.tsx          # Основное приложение
│   ├── types.ts           # TypeScript типы  
│   └── routes/            # API маршруты
│       ├── requests.ts    # Заявки
│       ├── telegram.ts    # Telegram интеграция
│       ├── gemini.ts      # Google Gemini API
│       ├── letters.ts     # Письма
│       └── email.ts       # Email отправка
├── migrations/            # Схема БД
├── wrangler.jsonc         # Конфигурация Cloudflare
└── package.json           # Зависимости и скрипты
```

## 📞 Контакты и поддержка

- **Руководитель проекта**: Денис Иванов (ООО «СтройИнвест и К»)
- **GitHub**: https://github.com/username/webapp
- **Техподдержка**: admin@stroiinvest.com

---

*Система разработана для автоматизации процессов управления изменениями проектной документации в строительных организациях.*