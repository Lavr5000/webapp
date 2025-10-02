import { Hono } from 'hono'
import { CloudflareBindings, TelegramMessage } from '../types'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Telegram webhook endpoint
app.post('/webhook', async (c) => {
  try {
    const body = await c.req.json()
    const message: TelegramMessage = body.message
    
    if (!message) {
      return c.json({ ok: true, result: 'No message' })
    }
    
    const userId = message.from.id.toString()
    const username = message.from.username || ''
    const userFullName = `${message.from.first_name} ${message.from.last_name || ''}`.trim()
    
    // Проверяем, зарегистрирован ли пользователь
    let user = await c.env.DB.prepare(
      'SELECT * FROM users WHERE telegram_user_id = ?'
    ).bind(userId).first()
    
    // Если пользователь не зарегистрирован, создаем его
    if (!user) {
      await c.env.DB.prepare(`
        INSERT INTO users (telegram_user_id, telegram_username, name, role)
        VALUES (?, ?, ?, 'user')
      `).bind(userId, username, userFullName).run()
      
      user = { 
        telegram_user_id: userId, 
        telegram_username: username, 
        name: userFullName, 
        role: 'user' 
      }
    }
    
    // Обработка текстовых сообщений
    if (message.text) {
      // Проверяем команды
      if (message.text.startsWith('/')) {
        return await handleCommand(c, message, user)
      }
      
      // Создаем заявку из текстового сообщения
      const request = await c.env.DB.prepare(`
        INSERT INTO requests (
          telegram_user_id, telegram_username, user_name, 
          message_text, status
        ) VALUES (?, ?, ?, ?, 'новая')
      `).bind(
        userId,
        username,
        userFullName,
        message.text
      ).run()
      
      // Отправляем подтверждение пользователю
      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `✅ Заявка №${request.meta?.last_row_id} принята к рассмотрению.\n\n` +
        `Ваш текст: "${message.text}"\n\n` +
        'Заявка будет автоматически проанализирована и передана администратору.'
      )
      
      // Уведомляем администратора о новой заявке
      await notifyAdmins(c, {
        requestId: request.meta?.last_row_id,
        userName: userFullName,
        messageText: message.text
      })
      
      // Запускаем анализ через Gemini (асинхронно)
      if (c.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        // В реальном приложении это должно быть в фоновой задаче
        analyzeRequestWithGemini(c, request.meta?.last_row_id as number, message.text)
          .catch(error => console.error('Gemini analysis error:', error))
      }
    }
    
    // Обработка голосовых сообщений
    if (message.voice) {
      try {
        // Получаем файл от Telegram
        const fileInfo = await getTelegramFile(c.env.TELEGRAM_BOT_TOKEN, message.voice.file_id)
        const audioUrl = `https://api.telegram.org/file/bot${c.env.TELEGRAM_BOT_TOKEN}/${fileInfo.file_path}`
        
        // Создаем заявку с голосовым сообщением
        const request = await c.env.DB.prepare(`
          INSERT INTO requests (
            telegram_user_id, telegram_username, user_name, 
            message_text, audio_file_url, status
          ) VALUES (?, ?, ?, ?, ?, 'новая')
        `).bind(
          userId,
          username,
          userFullName,
          '[Голосовое сообщение]',
          audioUrl
        ).run()
        
        await sendTelegramMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          `🎤 Голосовая заявка №${request.meta?.last_row_id} получена.\n\n` +
          'Сообщение будет распознано и передано администратору для рассмотрения.'
        )
        
        // Уведомляем администратора
        await notifyAdmins(c, {
          requestId: request.meta?.last_row_id,
          userName: userFullName,
          messageText: '[Голосовое сообщение]',
          hasAudio: true
        })
        
        // Транскрипция через Gemini (если поддерживается)
        if (c.env.GOOGLE_GENERATIVE_AI_API_KEY) {
          transcribeAudioWithGemini(c, request.meta?.last_row_id as number, audioUrl)
            .catch(error => console.error('Audio transcription error:', error))
        }
        
      } catch (error) {
        console.error('Voice message processing error:', error)
        await sendTelegramMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          '❌ Ошибка обработки голосового сообщения. Попробуйте отправить текст.'
        )
      }
    }
    
    return c.json({ ok: true })
  } catch (error) {
    console.error('Telegram webhook error:', error)
    return c.json({ ok: false, error: 'Internal server error' }, 500)
  }
})

// Обработка команд
async function handleCommand(c: any, message: TelegramMessage, user: any) {
  const command = message.text?.split(' ')[0]
  
  switch (command) {
    case '/start':
      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        `👋 Добро пожаловать, ${user.name}!\n\n` +
        'Это бот для подачи заявок на изменение проектной документации.\n\n' +
        '📝 Просто напишите ваш запрос текстом или отправьте голосовое сообщение.\n' +
        '🤖 Система автоматически проанализирует заявку и передаст администратору.\n\n' +
        'Доступные команды:\n' +
        '/help - помощь\n' +
        '/status - статус ваших заявок\n' +
        '/info - информация о системе'
      )
      break
      
    case '/help':
      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        '📋 Как подать заявку:\n\n' +
        '1. Опишите необходимые изменения в документации\n' +
        '2. Укажите раздел документа (если знаете)\n' +
        '3. Отметьте срочность запроса\n\n' +
        '💡 Примеры заявок:\n' +
        '• "Исправить ошибку в разделе Фундаменты - неверная марка бетона"\n' +
        '• "Добавить в раздел Кровля описание водосточной системы"\n' +
        '• "Обновить схему электроснабжения согласно новым нормам"\n\n' +
        '🎤 Вы также можете отправить голосовое сообщение.'
      )
      break
      
    case '/status':
      const requests = await c.env.DB.prepare(
        'SELECT * FROM requests WHERE telegram_user_id = ? ORDER BY created_at DESC LIMIT 5'
      ).bind(user.telegram_user_id).all()
      
      if (!requests.results?.length) {
        await sendTelegramMessage(
          c.env.TELEGRAM_BOT_TOKEN,
          message.chat.id,
          '📝 У вас пока нет поданных заявок.\n\nОтправьте сообщение с описанием необходимых изменений в документации.'
        )
      } else {
        let statusText = '📊 Ваши последние заявки:\n\n'
        requests.results.forEach((req: any, index: number) => {
          const statusEmoji = getStatusEmoji(req.status)
          const date = new Date(req.created_at).toLocaleString('ru-RU')
          statusText += `${statusEmoji} Заявка №${req.id}\n`
          statusText += `📅 ${date}\n`
          statusText += `💬 ${req.message_text.substring(0, 100)}${req.message_text.length > 100 ? '...' : ''}\n\n`
        })
        
        await sendTelegramMessage(c.env.TELEGRAM_BOT_TOKEN, message.chat.id, statusText)
      }
      break
      
    case '/info':
      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        '🏢 Система управления заявками\n' +
        'Изменения проектной документации\n\n' +
        '🤖 Возможности:\n' +
        '• Автоматический анализ заявок с помощью AI\n' +
        '• Классификация по срочности и типу\n' +
        '• Уведомления о статусе обработки\n' +
        '• Поддержка голосовых сообщений\n\n' +
        '👥 Администратор: @admin_user\n' +
        '📞 Техподдержка: +7-xxx-xxx-xxxx'
      )
      break
      
    default:
      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        message.chat.id,
        '❓ Неизвестная команда.\n\nИспользуйте /help для получения справки.'
      )
  }
  
  return c.json({ ok: true })
}

// Отправка сообщения в Telegram
async function sendTelegramMessage(botToken: string, chatId: number, text: string) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    })
    
    return await response.json()
  } catch (error) {
    console.error('Error sending Telegram message:', error)
    throw error
  }
}

// Получение информации о файле от Telegram
async function getTelegramFile(botToken: string, fileId: string) {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`)
  const data = await response.json()
  return data.result
}

// Уведомление администраторов
async function notifyAdmins(c: any, data: { requestId: any, userName: string, messageText: string, hasAudio?: boolean }) {
  try {
    const admins = await c.env.DB.prepare(
      'SELECT telegram_user_id FROM users WHERE role IN ("admin", "manager") AND is_active = TRUE'
    ).all()
    
    const notificationText = 
      `🔔 Новая заявка №${data.requestId}\n\n` +
      `👤 От: ${data.userName}\n` +
      `💬 Текст: ${data.messageText}\n` +
      (data.hasAudio ? '🎤 Содержит голосовое сообщение\n' : '') +
      `\n🔗 Просмотр: /admin`
    
    for (const admin of (admins.results || [])) {
      await sendTelegramMessage(
        c.env.TELEGRAM_BOT_TOKEN,
        parseInt((admin as any).telegram_user_id),
        notificationText
      )
    }
  } catch (error) {
    console.error('Error notifying admins:', error)
  }
}

// Анализ заявки через Gemini (заглушка)
async function analyzeRequestWithGemini(c: any, requestId: number, text: string) {
  // Здесь будет реализован вызов Gemini API
  console.log(`Analyzing request ${requestId} with Gemini: ${text}`)
}

// Транскрипция аудио через Gemini (заглушка)
async function transcribeAudioWithGemini(c: any, requestId: number, audioUrl: string) {
  // Здесь будет реализована транскрипция через Gemini
  console.log(`Transcribing audio for request ${requestId}: ${audioUrl}`)
}

// Получение эмодзи для статуса
function getStatusEmoji(status: string): string {
  const statusEmojis: { [key: string]: string } = {
    'новая': '🆕',
    'на_рассмотрении': '👀',
    'одобрена': '✅',
    'отклонена': '❌',
    'в_работе': '🔄',
    'завершена': '✅'
  }
  return statusEmojis[status] || '📝'
}

// Настройка webhook (для development)
app.post('/set-webhook', async (c) => {
  try {
    const { url } = await c.req.json()
    const botToken = c.env.TELEGRAM_BOT_TOKEN
    
    const response = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: url || c.env.TELEGRAM_WEBHOOK_URL,
        allowed_updates: ['message']
      })
    })
    
    const result = await response.json()
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Error setting webhook:', error)
    return c.json({ success: false, error: 'Ошибка установки webhook' }, 500)
  }
})

// Получение информации о webhook
app.get('/webhook-info', async (c) => {
  try {
    const botToken = c.env.TELEGRAM_BOT_TOKEN
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`)
    const result = await response.json()
    
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Error getting webhook info:', error)
    return c.json({ success: false, error: 'Ошибка получения информации о webhook' }, 500)
  }
})

export default app