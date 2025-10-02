import { Hono } from 'hono'
import { CloudflareBindings } from '../types'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Отправить письмо заказчику
app.post('/send-letter', async (c) => {
  try {
    const { letterId, recipientEmail, subject } = await c.req.json()
    
    if (!letterId || !recipientEmail) {
      return c.json({ 
        success: false, 
        error: 'Требуется ID письма и email получателя' 
      }, 400)
    }
    
    // Получаем письмо
    const letter = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(letterId)
      .first()
    
    if (!letter) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    if ((letter as any).status !== 'подписан') {
      return c.json({ 
        success: false, 
        error: 'Можно отправить только подписанные письма' 
      }, 400)
    }
    
    const emailSubject = subject || (letter as any).title
    const emailContent = await formatEmailContent((letter as any).content, letter as any)
    
    // Отправляем email через внешний сервис
    const emailResult = await sendEmailViaAPI(
      c.env.EMAIL_API_KEY,
      c.env.EMAIL_FROM,
      recipientEmail,
      emailSubject,
      emailContent
    )
    
    if (emailResult.success) {
      // Обновляем статус письма
      await c.env.DB.prepare(`
        UPDATE letters 
        SET status = 'отправлен', 
            recipient_email = ?, 
            sent_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(recipientEmail, letterId).run()
      
      // Логируем отправку
      await c.env.DB.prepare(`
        INSERT INTO email_logs (letter_id, recipient_email, subject, status)
        VALUES (?, ?, ?, 'отправлено')
      `).bind(letterId, recipientEmail, emailSubject).run()
      
      // Обновляем статус связанных заявок
      const requestIds = JSON.parse((letter as any).request_ids)
      const placeholders = requestIds.map(() => '?').join(',')
      
      await c.env.DB.prepare(
        `UPDATE requests SET status = 'завершена' WHERE id IN (${placeholders})`
      ).bind(...requestIds).run()
      
      return c.json({
        success: true,
        message: 'Письмо успешно отправлено',
        data: {
          messageId: emailResult.messageId,
          recipient: recipientEmail,
          subject: emailSubject
        }
      })
    } else {
      // Логируем ошибку
      await c.env.DB.prepare(`
        INSERT INTO email_logs (letter_id, recipient_email, subject, status, error_message)
        VALUES (?, ?, ?, 'ошибка', ?)
      `).bind(letterId, recipientEmail, emailSubject, emailResult.error).run()
      
      return c.json({ 
        success: false, 
        error: `Ошибка отправки: ${emailResult.error}` 
      }, 500)
    }
  } catch (error) {
    console.error('Email sending error:', error)
    return c.json({ success: false, error: 'Ошибка отправки email' }, 500)
  }
})

// Отправить тестовое письмо
app.post('/send-test', async (c) => {
  try {
    const { recipientEmail, subject, content } = await c.req.json()
    
    if (!recipientEmail) {
      return c.json({ success: false, error: 'Требуется email получателя' }, 400)
    }
    
    const testSubject = subject || 'Тестовое письмо - Система управления заявками'
    const testContent = content || `
      <h2>Тестовое письмо</h2>
      <p>Это тестовое письмо из системы управления заявками на изменение проектной документации.</p>
      <p>Если вы получили это письмо, значит система email работает корректно.</p>
      <p>Время отправки: ${new Date().toLocaleString('ru-RU')}</p>
    `
    
    const emailResult = await sendEmailViaAPI(
      c.env.EMAIL_API_KEY,
      c.env.EMAIL_FROM,
      recipientEmail,
      testSubject,
      testContent
    )
    
    // Логируем отправку
    await c.env.DB.prepare(`
      INSERT INTO email_logs (recipient_email, subject, status, error_message)
      VALUES (?, ?, ?, ?)
    `).bind(
      recipientEmail, 
      testSubject, 
      emailResult.success ? 'отправлено' : 'ошибка',
      emailResult.error || null
    ).run()
    
    if (emailResult.success) {
      return c.json({
        success: true,
        message: 'Тестовое письмо отправлено',
        data: {
          messageId: emailResult.messageId,
          recipient: recipientEmail
        }
      })
    } else {
      return c.json({ 
        success: false, 
        error: `Ошибка отправки: ${emailResult.error}` 
      }, 500)
    }
  } catch (error) {
    console.error('Test email error:', error)
    return c.json({ success: false, error: 'Ошибка отправки тестового письма' }, 500)
  }
})

// Получить историю отправленных писем
app.get('/logs', async (c) => {
  try {
    const { status, limit = '50', offset = '0' } = c.req.query()
    
    let query = 'SELECT * FROM email_logs WHERE 1=1'
    const params: any[] = []
    
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    
    query += ' ORDER BY sent_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))
    
    const result = await c.env.DB.prepare(query).bind(...params).all()
    
    return c.json({
      success: true,
      data: result.results || [],
      total: result.results?.length || 0
    })
  } catch (error) {
    console.error('Error fetching email logs:', error)
    return c.json({ success: false, error: 'Ошибка получения логов' }, 500)
  }
})

// Получить статистику отправки
app.get('/stats', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM email_logs 
      WHERE sent_at >= date('now', '-30 days')
      GROUP BY status
    `).all()
    
    const dailyStats = await c.env.DB.prepare(`
      SELECT 
        date(sent_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'отправлено' THEN 1 ELSE 0 END) as successful,
        SUM(CASE WHEN status = 'ошибка' THEN 1 ELSE 0 END) as failed
      FROM email_logs 
      WHERE sent_at >= date('now', '-7 days')
      GROUP BY date(sent_at)
      ORDER BY date
    `).all()
    
    return c.json({
      success: true,
      data: {
        byStatus: stats.results || [],
        daily: dailyStats.results || []
      }
    })
  } catch (error) {
    console.error('Error fetching email stats:', error)
    return c.json({ success: false, error: 'Ошибка получения статистики' }, 500)
  }
})

// Проверить настройки email
app.get('/config/test', async (c) => {
  try {
    const hasApiKey = !!c.env.EMAIL_API_KEY
    const hasFromEmail = !!c.env.EMAIL_FROM
    
    return c.json({
      success: true,
      data: {
        apiKeyConfigured: hasApiKey,
        fromEmailConfigured: hasFromEmail,
        ready: hasApiKey && hasFromEmail,
        fromEmail: hasFromEmail ? c.env.EMAIL_FROM : null
      }
    })
  } catch (error) {
    return c.json({ success: false, error: 'Ошибка проверки конфигурации' }, 500)
  }
})

// === ФУНКЦИИ ОТПРАВКИ EMAIL ===

// Универсальная функция отправки через внешний API
async function sendEmailViaAPI(
  apiKey: string, 
  fromEmail: string, 
  toEmail: string, 
  subject: string, 
  content: string
) {
  if (!apiKey || !fromEmail) {
    return { 
      success: false, 
      error: 'Email API не настроен (отсутствует API ключ или адрес отправителя)' 
    }
  }
  
  // Попробуем определить провайдера по API ключу
  // SendGrid ключи обычно начинаются с 'SG.'
  // Resend ключи начинаются с 're_'
  
  if (apiKey.startsWith('SG.')) {
    return await sendViaSendGrid(apiKey, fromEmail, toEmail, subject, content)
  } else if (apiKey.startsWith('re_')) {
    return await sendViaResend(apiKey, fromEmail, toEmail, subject, content)
  } else {
    // Пробуем SendGrid по умолчанию
    return await sendViaSendGrid(apiKey, fromEmail, toEmail, subject, content)
  }
}

// Отправка через SendGrid
async function sendViaSendGrid(
  apiKey: string, 
  fromEmail: string, 
  toEmail: string, 
  subject: string, 
  content: string
) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: toEmail }],
          subject: subject
        }],
        from: { email: fromEmail },
        content: [{
          type: 'text/html',
          value: content
        }]
      })
    })
    
    if (response.ok) {
      const messageId = response.headers.get('X-Message-Id') || 'unknown'
      return { success: true, messageId, provider: 'SendGrid' }
    } else {
      const errorData = await response.text()
      return { 
        success: false, 
        error: `SendGrid error (${response.status}): ${errorData}` 
      }
    }
  } catch (error) {
    return { 
      success: false, 
      error: `SendGrid network error: ${error.message}` 
    }
  }
}

// Отправка через Resend
async function sendViaResend(
  apiKey: string, 
  fromEmail: string, 
  toEmail: string, 
  subject: string, 
  content: string
) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: subject,
        html: content
      })
    })
    
    if (response.ok) {
      const result = await response.json()
      return { 
        success: true, 
        messageId: result.id || 'unknown', 
        provider: 'Resend' 
      }
    } else {
      const errorData = await response.json()
      return { 
        success: false, 
        error: `Resend error (${response.status}): ${errorData.message || 'Unknown error'}` 
      }
    }
  } catch (error) {
    return { 
      success: false, 
      error: `Resend network error: ${error.message}` 
    }
  }
}

// Форматирование содержимого письма
async function formatEmailContent(content: string, letter: any) {
  const formattedDate = new Date(letter.signed_at || letter.created_at).toLocaleDateString('ru-RU')
  
  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${letter.title}</title>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
            .header { border-bottom: 2px solid #0066cc; padding-bottom: 20px; margin-bottom: 30px; }
            .footer { border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; font-size: 12px; color: #666; }
            h1, h2, h3 { color: #0066cc; }
            .signature { margin-top: 40px; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Изменения в проектной документации</h1>
            <p><strong>Дата:</strong> ${formattedDate}</p>
        </div>
        
        <div class="content">
            ${content}
        </div>
        
        <div class="signature">
            <p>С уважением,<br>
            Проектно-технический отдел<br>
            ООО «СтройИнвест и К»</p>
        </div>
        
        <div class="footer">
            <p>Это письмо было сгенерировано автоматически системой управления заявками на изменение проектной документации.</p>
            <p>Если у вас есть вопросы, свяжитесь с нашим отделом.</p>
        </div>
    </body>
    </html>
  `
}

export default app