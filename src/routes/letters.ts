import { Hono } from 'hono'
import { CloudflareBindings, Letter } from '../types'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Получить все письма
app.get('/', async (c) => {
  try {
    const { status, limit = '20', offset = '0' } = c.req.query()
    
    let query = 'SELECT * FROM letters WHERE 1=1'
    const params: any[] = []
    
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'
    params.push(parseInt(limit), parseInt(offset))
    
    const result = await c.env.DB.prepare(query).bind(...params).all()
    
    return c.json({
      success: true,
      data: result.results || [],
      total: result.results?.length || 0
    })
  } catch (error) {
    console.error('Error fetching letters:', error)
    return c.json({ success: false, error: 'Ошибка получения писем' }, 500)
  }
})

// Получить письмо по ID с подробной информацией
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const letter = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    if (!letter) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    // Получаем связанные заявки
    const requestIds = JSON.parse((letter as any).request_ids)
    const placeholders = requestIds.map(() => '?').join(',')
    
    const requests = await c.env.DB.prepare(
      `SELECT * FROM requests WHERE id IN (${placeholders})`
    ).bind(...requestIds).all()
    
    return c.json({
      success: true,
      data: {
        ...letter,
        relatedRequests: requests.results || []
      }
    })
  } catch (error) {
    console.error('Error fetching letter:', error)
    return c.json({ success: false, error: 'Ошибка получения письма' }, 500)
  }
})

// Обновить письмо (статус, комментарии, содержимое)
app.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const {
      title,
      content,
      status,
      manager_comment,
      recipient_email
    } = body
    
    // Проверяем существование письма
    const existing = await c.env.DB.prepare('SELECT id FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    if (!existing) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    // Формируем обновления
    const updates: string[] = []
    const params: any[] = []
    
    if (title !== undefined) {
      updates.push('title = ?')
      params.push(title)
    }
    
    if (content !== undefined) {
      updates.push('content = ?')
      params.push(content)
    }
    
    if (status !== undefined) {
      updates.push('status = ?')
      params.push(status)
      
      // Если статус "подписан", устанавливаем время подписи
      if (status === 'подписан') {
        updates.push('signed_at = CURRENT_TIMESTAMP')
      }
    }
    
    if (manager_comment !== undefined) {
      updates.push('manager_comment = ?')
      params.push(manager_comment)
    }
    
    if (recipient_email !== undefined) {
      updates.push('recipient_email = ?')
      params.push(recipient_email)
    }
    
    if (updates.length === 0) {
      return c.json({ success: false, error: 'Нет полей для обновления' }, 400)
    }
    
    params.push(id)
    const query = `UPDATE letters SET ${updates.join(', ')} WHERE id = ?`
    
    await c.env.DB.prepare(query).bind(...params).run()
    
    // Получаем обновленное письмо
    const updated = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('Error updating letter:', error)
    return c.json({ success: false, error: 'Ошибка обновления письма' }, 500)
  }
})

// Подписать письмо (для руководителя)
app.post('/:id/sign', async (c) => {
  try {
    const id = c.req.param('id')
    const { manager_comment, signature_file } = await c.req.json()
    
    const letter = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    if (!letter) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    if ((letter as any).status !== 'на_согласовании') {
      return c.json({ 
        success: false, 
        error: 'Письмо не находится на согласовании' 
      }, 400)
    }
    
    // Обновляем статус и данные подписания
    await c.env.DB.prepare(`
      UPDATE letters 
      SET status = 'подписан', 
          manager_comment = ?, 
          signed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(manager_comment || null, id).run()
    
    // Получаем обновленное письмо
    const updated = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    return c.json({
      success: true,
      data: updated,
      message: 'Письмо подписано и готово к отправке'
    })
  } catch (error) {
    console.error('Error signing letter:', error)
    return c.json({ success: false, error: 'Ошибка подписания письма' }, 500)
  }
})

// Отклонить письмо (для руководителя)
app.post('/:id/reject', async (c) => {
  try {
    const id = c.req.param('id')
    const { reason } = await c.req.json()
    
    const letter = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    if (!letter) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    if ((letter as any).status === 'отправлен') {
      return c.json({ 
        success: false, 
        error: 'Отправленное письмо нельзя отклонить' 
      }, 400)
    }
    
    // Возвращаем письмо в черновики с комментарием
    await c.env.DB.prepare(`
      UPDATE letters 
      SET status = 'черновик', 
          manager_comment = ?
      WHERE id = ?
    `).bind(reason || 'Отклонено руководителем', id).run()
    
    // Возвращаем связанные заявки в статус "одобрена"
    const requestIds = JSON.parse((letter as any).request_ids)
    const placeholders = requestIds.map(() => '?').join(',')
    
    await c.env.DB.prepare(
      `UPDATE requests SET status = 'одобрена' WHERE id IN (${placeholders})`
    ).bind(...requestIds).run()
    
    const updated = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    return c.json({
      success: true,
      data: updated,
      message: 'Письмо отклонено и возвращено в черновики'
    })
  } catch (error) {
    console.error('Error rejecting letter:', error)
    return c.json({ success: false, error: 'Ошибка отклонения письма' }, 500)
  }
})

// Отправить письмо на согласование
app.post('/:id/submit', async (c) => {
  try {
    const id = c.req.param('id')
    
    const letter = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    if (!letter) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    if ((letter as any).status !== 'черновик') {
      return c.json({ 
        success: false, 
        error: 'На согласование можно отправить только черновик' 
      }, 400)
    }
    
    // Меняем статус на "на_согласовании"
    await c.env.DB.prepare(`
      UPDATE letters 
      SET status = 'на_согласовании'
      WHERE id = ?
    `).bind(id).run()
    
    // Уведомляем руководителя через Telegram (если настроен)
    if (c.env.TELEGRAM_BOT_TOKEN) {
      await notifyManagerAboutLetter(c, letter as any)
    }
    
    const updated = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    return c.json({
      success: true,
      data: updated,
      message: 'Письмо отправлено на согласование руководителю'
    })
  } catch (error) {
    console.error('Error submitting letter:', error)
    return c.json({ success: false, error: 'Ошибка отправки на согласование' }, 500)
  }
})

// Получить статистику писем
app.get('/stats/overview', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count
      FROM letters 
      GROUP BY status
    `).all()
    
    const monthlyStats = await c.env.DB.prepare(`
      SELECT 
        strftime('%Y-%m', created_at) as month,
        COUNT(*) as count
      FROM letters 
      WHERE created_at >= date('now', '-12 months')
      GROUP BY month
      ORDER BY month
    `).all()
    
    return c.json({
      success: true,
      data: {
        byStatus: stats.results || [],
        byMonth: monthlyStats.results || []
      }
    })
  } catch (error) {
    console.error('Error fetching letter stats:', error)
    return c.json({ success: false, error: 'Ошибка получения статистики' }, 500)
  }
})

// Удалить письмо (только черновики)
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const letter = await c.env.DB.prepare('SELECT * FROM letters WHERE id = ?')
      .bind(id)
      .first()
    
    if (!letter) {
      return c.json({ success: false, error: 'Письмо не найдено' }, 404)
    }
    
    if ((letter as any).status !== 'черновик') {
      return c.json({ 
        success: false, 
        error: 'Можно удалить только черновики' 
      }, 400)
    }
    
    // Возвращаем связанные заявки в статус "одобрена"
    const requestIds = JSON.parse((letter as any).request_ids)
    const placeholders = requestIds.map(() => '?').join(',')
    
    await c.env.DB.prepare(
      `UPDATE requests SET status = 'одобрена' WHERE id IN (${placeholders})`
    ).bind(...requestIds).run()
    
    // Удаляем письмо
    await c.env.DB.prepare('DELETE FROM letters WHERE id = ?').bind(id).run()
    
    return c.json({ 
      success: true, 
      message: 'Письмо удалено, связанные заявки возвращены в статус "одобрена"' 
    })
  } catch (error) {
    console.error('Error deleting letter:', error)
    return c.json({ success: false, error: 'Ошибка удаления письма' }, 500)
  }
})

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

// Уведомление руководителя о новом письме
async function notifyManagerAboutLetter(c: any, letter: any) {
  try {
    // Получаем руководителей
    const managers = await c.env.DB.prepare(
      'SELECT telegram_user_id FROM users WHERE role = "manager" AND is_active = TRUE'
    ).all()
    
    const message = 
      `📋 Новое письмо на согласование\n\n` +
      `📝 Заголовок: ${letter.title}\n` +
      `📊 Заявок включено: ${JSON.parse(letter.request_ids).length}\n` +
      `📅 Создано: ${new Date(letter.created_at).toLocaleString('ru-RU')}\n\n` +
      `🔗 Перейти к согласованию: /manager`
    
    for (const manager of (managers.results || [])) {
      await fetch(`https://api.telegram.org/bot${c.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: (manager as any).telegram_user_id,
          text: message
        })
      })
    }
  } catch (error) {
    console.error('Error notifying manager:', error)
  }
}

export default app