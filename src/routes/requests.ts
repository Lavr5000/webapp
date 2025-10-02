import { Hono } from 'hono'
import { CloudflareBindings, Request } from '../types'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Получить все заявки с фильтрацией
app.get('/', async (c) => {
  try {
    const { status, category, limit = '50', offset = '0' } = c.req.query()
    
    let query = 'SELECT * FROM requests WHERE 1=1'
    const params: any[] = []
    
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }
    
    if (category) {
      query += ' AND category = ?'
      params.push(category)
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
    console.error('Error fetching requests:', error)
    return c.json({ success: false, error: 'Ошибка получения заявок' }, 500)
  }
})

// Получить заявку по ID
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const result = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?')
      .bind(id)
      .first()
    
    if (!result) {
      return c.json({ success: false, error: 'Заявка не найдена' }, 404)
    }
    
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Error fetching request:', error)
    return c.json({ success: false, error: 'Ошибка получения заявки' }, 500)
  }
})

// Создать новую заявку
app.post('/', async (c) => {
  try {
    const body = await c.req.json()
    
    const {
      telegram_user_id,
      telegram_username,
      user_name,
      message_text,
      audio_file_url,
      transcribed_text,
      category,
      urgency_level = 2,
      change_type,
      doc_section
    } = body
    
    // Валидация обязательных полей
    if (!telegram_user_id || !user_name || !message_text) {
      return c.json({ 
        success: false, 
        error: 'Обязательные поля: telegram_user_id, user_name, message_text' 
      }, 400)
    }
    
    const result = await c.env.DB.prepare(`
      INSERT INTO requests (
        telegram_user_id, telegram_username, user_name, message_text,
        audio_file_url, transcribed_text, category, urgency_level,
        change_type, doc_section, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'новая')
    `).bind(
      telegram_user_id,
      telegram_username || null,
      user_name,
      message_text,
      audio_file_url || null,
      transcribed_text || null,
      category || null,
      urgency_level,
      change_type || null,
      doc_section || null
    ).run()
    
    return c.json({ 
      success: true, 
      data: { id: result.meta?.last_row_id, ...body, status: 'новая' }
    }, 201)
  } catch (error) {
    console.error('Error creating request:', error)
    return c.json({ success: false, error: 'Ошибка создания заявки' }, 500)
  }
})

// Обновить заявку
app.put('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    
    const {
      status,
      is_approved,
      admin_comment,
      category,
      urgency_level,
      change_type,
      doc_section
    } = body
    
    // Проверяем, существует ли заявка
    const existing = await c.env.DB.prepare('SELECT id FROM requests WHERE id = ?')
      .bind(id)
      .first()
    
    if (!existing) {
      return c.json({ success: false, error: 'Заявка не найдена' }, 404)
    }
    
    // Формируем запрос на обновление только переданных полей
    const updates: string[] = []
    const params: any[] = []
    
    if (status !== undefined) {
      updates.push('status = ?')
      params.push(status)
    }
    
    if (is_approved !== undefined) {
      updates.push('is_approved = ?')
      params.push(is_approved)
    }
    
    if (admin_comment !== undefined) {
      updates.push('admin_comment = ?')
      params.push(admin_comment)
    }
    
    if (category !== undefined) {
      updates.push('category = ?')
      params.push(category)
    }
    
    if (urgency_level !== undefined) {
      updates.push('urgency_level = ?')
      params.push(urgency_level)
    }
    
    if (change_type !== undefined) {
      updates.push('change_type = ?')
      params.push(change_type)
    }
    
    if (doc_section !== undefined) {
      updates.push('doc_section = ?')
      params.push(doc_section)
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP')
    params.push(id)
    
    if (updates.length === 1) { // Только updated_at
      return c.json({ success: false, error: 'Нет полей для обновления' }, 400)
    }
    
    const query = `UPDATE requests SET ${updates.join(', ')} WHERE id = ?`
    
    await c.env.DB.prepare(query).bind(...params).run()
    
    // Получаем обновленную заявку
    const updated = await c.env.DB.prepare('SELECT * FROM requests WHERE id = ?')
      .bind(id)
      .first()
    
    return c.json({ success: true, data: updated })
  } catch (error) {
    console.error('Error updating request:', error)
    return c.json({ success: false, error: 'Ошибка обновления заявки' }, 500)
  }
})

// Удалить заявку
app.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    
    const result = await c.env.DB.prepare('DELETE FROM requests WHERE id = ?')
      .bind(id)
      .run()
    
    if (result.changes === 0) {
      return c.json({ success: false, error: 'Заявка не найдена' }, 404)
    }
    
    return c.json({ success: true, message: 'Заявка удалена' })
  } catch (error) {
    console.error('Error deleting request:', error)
    return c.json({ success: false, error: 'Ошибка удаления заявки' }, 500)
  }
})

// Получить статистику заявок
app.get('/stats/overview', async (c) => {
  try {
    const stats = await c.env.DB.prepare(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(urgency_level) as avg_urgency
      FROM requests 
      GROUP BY status
    `).all()
    
    const categoryStats = await c.env.DB.prepare(`
      SELECT 
        category,
        COUNT(*) as count
      FROM requests 
      WHERE category IS NOT NULL
      GROUP BY category
    `).all()
    
    return c.json({
      success: true,
      data: {
        byStatus: stats.results || [],
        byCategory: categoryStats.results || []
      }
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return c.json({ success: false, error: 'Ошибка получения статистики' }, 500)
  }
})

export default app