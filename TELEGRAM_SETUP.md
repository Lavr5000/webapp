# Инструкция по настройке Telegram Bot

## 1. Создание бота через BotFather

### Шаг 1: Найдите BotFather
1. Откройте Telegram
2. Найдите и откройте чат с **@BotFather**
3. Нажмите "Start" или отправьте `/start`

### Шаг 2: Создайте нового бота
1. Отправьте команду `/newbot`
2. BotFather попросит название бота. Введите: **"Изменение проектной документации"**
3. Затем выберите username для бота (должен заканчиваться на "bot"):
   - Примеры: `doc_changes_bot`, `project_docs_bot`, `stroiinvest_docs_bot`
4. Скопируйте токен, который выдаст BotFather (выглядит как: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)

### Шаг 3: Настройте описание и команды
```
/setdescription @ваш_бот_username
Бот для подачи заявок на изменение проектной документации. Отправьте текст или голосовое сообщение с описанием необходимых изменений.

/setcommands @ваш_бот_username
start - Начать работу с ботом
help - Справка по использованию  
status - Статус ваших заявок
info - Информация о системе

/setabouttext @ваш_бот_username
Система управления заявками на изменение проектной документации ООО «СтройИнвест и К»
```

## 2. Настройка токена в приложении

### Для локальной разработки
Добавьте токен в файл `.dev.vars`:
```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

### Для production (Cloudflare Pages)
```bash
npx wrangler pages secret put TELEGRAM_BOT_TOKEN --project-name webapp
# Введите токен при запросе
```

## 3. Настройка webhook

### Автоматическая настройка через API
После развертывания приложения выполните POST запрос:

```bash
curl -X POST https://your-app.pages.dev/api/telegram/set-webhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.pages.dev/api/telegram/webhook"}'
```

### Или вручную через Telegram API
```bash
curl -X POST "https://api.telegram.org/bot[YOUR_BOT_TOKEN]/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.pages.dev/api/telegram/webhook",
    "allowed_updates": ["message"]
  }'
```

### Проверка webhook
```bash
curl -X GET https://your-app.pages.dev/api/telegram/webhook-info
```

## 4. Тестирование бота

### Базовые команды для проверки:
1. `/start` - Регистрация пользователя
2. `/help` - Получение справки
3. `/status` - Проверка заявок
4. `/info` - Информация о системе

### Отправка заявки:
Просто напишите боту сообщение с описанием изменений:
```
"Необходимо исправить ошибку в разделе Фундаменты. В пункте 3.2.1 указана неверная марка бетона - должно быть М300 вместо М250."
```

## 5. Добавление администраторов

### Шаг 1: Узнайте Telegram ID
1. Напишите боту @userinfobot команду `/start`  
2. Он покажет ваш Telegram ID (например: 123456789)

### Шаг 2: Добавьте в базу данных
```sql
-- Локально
npx wrangler d1 execute webapp-production --local --command="
INSERT INTO users (telegram_user_id, telegram_username, name, role) 
VALUES ('123456789', 'denis_manager', 'Денис Иванов', 'manager')
"

-- Production  
npx wrangler d1 execute webapp-production --command="
INSERT INTO users (telegram_user_id, telegram_username, name, role) 
VALUES ('123456789', 'denis_manager', 'Денис Иванов', 'manager')
"
```

## 6. Возможные проблемы и решения

### Проблема: Бот не отвечает
**Решение:**
1. Проверьте токен: `GET /api/telegram/webhook-info`
2. Проверьте webhook URL в ответе
3. Убедитесь, что приложение доступно по HTTPS

### Проблема: Webhook не работает  
**Решение:**
1. URL должен быть HTTPS (не HTTP)
2. Проверьте, что `/api/telegram/webhook` отвечает на POST запросы
3. Telegram требует ответ с кодом 200

### Проблема: Сообщения не сохраняются
**Решение:**
1. Проверьте подключение к базе D1
2. Убедитесь, что миграции применены
3. Проверьте логи через `pm2 logs webapp --nostream`

### Проблема: Уведомления не приходят администраторам
**Решение:**
1. Убедитесь, что администраторы добавлены в таблицу `users` с ролью `admin` или `manager`
2. Проверьте их `telegram_user_id`
3. Убедитесь, что они запустили бота командой `/start`

## 7. Дополнительные настройки

### Ограничение доступа
Для ограничения доступа к боту только сотрудникам компании, модифицируйте код в `src/routes/telegram.ts`:

```typescript
// Список разрешенных пользователей
const ALLOWED_USERS = ['username1', 'username2', 'denis_manager'];

// В обработчике сообщений добавьте проверку:
if (message.from.username && !ALLOWED_USERS.includes(message.from.username)) {
  await sendTelegramMessage(
    c.env.TELEGRAM_BOT_TOKEN,
    message.chat.id,
    '❌ У вас нет доступа к этому боту. Обратитесь к администратору.'
  );
  return c.json({ ok: true });
}
```

### Настройка меню бота
```bash
# Отправьте BotFather команду для установки меню
/setmenu @ваш_бот_username

# Затем отправьте структуру меню:
help - 📋 Справка по использованию
status - 📊 Мои заявки  
info - ℹ️ О системе
```

### Логирование для отладки
Добавьте в код дополнительное логирование:

```typescript
console.log('Received message:', {
  from: message.from,
  text: message.text,
  chat: message.chat.id
});
```

Проверяйте логи через:
```bash
pm2 logs webapp --nostream
```

## 8. Мониторинг бота

### Проверка статуса
```bash
# Health check
curl https://your-app.pages.dev/api/health

# Webhook info
curl https://your-app.pages.dev/api/telegram/webhook-info
```

### Просмотр статистики
```bash
# Количество пользователей
npx wrangler d1 execute webapp-production --command="SELECT COUNT(*) FROM users"

# Количество заявок за день
npx wrangler d1 execute webapp-production --command="
SELECT COUNT(*) FROM requests 
WHERE DATE(created_at) = DATE('now')
"
```

---

**Контакты для поддержки:**
- Техническая поддержка: admin@stroiinvest.com
- Telegram: @your_admin_username