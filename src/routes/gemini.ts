import { Hono } from 'hono'
import { CloudflareBindings, GeminiAnalysis } from '../types'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Анализ текста заявки через Gemini 2.5 Pro
app.post('/analyze', async (c) => {
  try {
    const { text, requestId } = await c.req.json()
    
    if (!text) {
      return c.json({ success: false, error: 'Требуется текст для анализа' }, 400)
    }
    
    const apiKey = c.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return c.json({ success: false, error: 'API ключ Gemini не настроен' }, 500)
    }
    
    const analysis = await analyzeTextWithGemini(apiKey, text)
    
    // Если передан requestId, обновляем заявку в базе
    if (requestId) {
      await c.env.DB.prepare(`
        UPDATE requests 
        SET category = ?, urgency_level = ?, change_type = ?, doc_section = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        analysis.category,
        analysis.urgency_level,
        analysis.change_type,
        analysis.doc_section,
        requestId
      ).run()
    }
    
    return c.json({
      success: true,
      data: analysis
    })
  } catch (error) {
    console.error('Gemini analysis error:', error)
    return c.json({ 
      success: false, 
      error: 'Ошибка анализа текста через Gemini' 
    }, 500)
  }
})

// Транскрипция аудио через Gemini (мультимодальный)
app.post('/transcribe', async (c) => {
  try {
    const { audioUrl, requestId } = await c.req.json()
    
    if (!audioUrl) {
      return c.json({ success: false, error: 'Требуется URL аудио файла' }, 400)
    }
    
    const apiKey = c.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return c.json({ success: false, error: 'API ключ Gemini не настроен' }, 500)
    }
    
    const transcription = await transcribeAudioWithGemini(apiKey, audioUrl)
    
    // Обновляем заявку с транскрипцией
    if (requestId && transcription.text) {
      await c.env.DB.prepare(`
        UPDATE requests 
        SET transcribed_text = ?, message_text = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        transcription.text,
        transcription.text, // Заменяем "[Голосовое сообщение]" на расшифровку
        requestId
      ).run()
      
      // Анализируем расшифрованный текст
      if (transcription.text.length > 10) {
        const analysis = await analyzeTextWithGemini(apiKey, transcription.text)
        
        await c.env.DB.prepare(`
          UPDATE requests 
          SET category = ?, urgency_level = ?, change_type = ?, doc_section = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          analysis.category,
          analysis.urgency_level,
          analysis.change_type,
          analysis.doc_section,
          requestId
        ).run()
      }
    }
    
    return c.json({
      success: true,
      data: transcription
    })
  } catch (error) {
    console.error('Audio transcription error:', error)
    return c.json({ 
      success: false, 
      error: 'Ошибка транскрипции аудио через Gemini' 
    }, 500)
  }
})

// Объединение одобренных заявок в письмо
app.post('/combine', async (c) => {
  try {
    const { requestIds, title } = await c.req.json()
    
    if (!requestIds || !Array.isArray(requestIds) || requestIds.length === 0) {
      return c.json({ success: false, error: 'Требуется массив ID заявок' }, 400)
    }
    
    const apiKey = c.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return c.json({ success: false, error: 'API ключ Gemini не настроен' }, 500)
    }
    
    // Получаем одобренные заявки
    const placeholders = requestIds.map(() => '?').join(',')
    const requests = await c.env.DB.prepare(
      `SELECT * FROM requests WHERE id IN (${placeholders}) AND is_approved = TRUE ORDER BY created_at`
    ).bind(...requestIds).all()
    
    if (!requests.results?.length) {
      return c.json({ success: false, error: 'Не найдено одобренных заявок' }, 404)
    }
    
    // Формируем контент для Gemini
    const requestsData = requests.results.map((req: any, index: number) => ({
      id: req.id,
      text: req.transcribed_text || req.message_text,
      author: req.user_name,
      date: new Date(req.created_at).toLocaleDateString('ru-RU'),
      category: req.category,
      changeType: req.change_type,
      docSection: req.doc_section,
      urgency: req.urgency_level
    }))
    
    const combinedLetter = await combineRequestsWithGemini(apiKey, requestsData, title)
    
    // Сохраняем письмо в базу данных
    const letterResult = await c.env.DB.prepare(`
      INSERT INTO letters (title, content, request_ids, status, created_by)
      VALUES (?, ?, ?, 'черновик', 1)
    `).bind(
      title || 'Заявки на изменение проектной документации',
      combinedLetter.content,
      JSON.stringify(requestIds)
    ).run()
    
    // Обновляем статус заявок
    await c.env.DB.prepare(
      `UPDATE requests SET status = 'в_работе' WHERE id IN (${placeholders})`
    ).bind(...requestIds).run()
    
    return c.json({
      success: true,
      data: {
        letterId: letterResult.meta?.last_row_id,
        title: title || 'Заявки на изменение проектной документации',
        content: combinedLetter.content,
        requestCount: requestIds.length
      }
    })
  } catch (error) {
    console.error('Letter combination error:', error)
    return c.json({ 
      success: false, 
      error: 'Ошибка объединения заявок в письмо' 
    }, 500)
  }
})

// Улучшение текста письма
app.post('/improve-text', async (c) => {
  try {
    const { text, context } = await c.req.json()
    
    if (!text) {
      return c.json({ success: false, error: 'Требуется текст для улучшения' }, 400)
    }
    
    const apiKey = c.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
      return c.json({ success: false, error: 'API ключ Gemini не настроен' }, 500)
    }
    
    const improvedText = await improveTextWithGemini(apiKey, text, context)
    
    return c.json({
      success: true,
      data: {
        originalText: text,
        improvedText: improvedText.content,
        improvements: improvedText.improvements
      }
    })
  } catch (error) {
    console.error('Text improvement error:', error)
    return c.json({ 
      success: false, 
      error: 'Ошибка улучшения текста через Gemini' 
    }, 500)
  }
})

// === ФУНКЦИИ РАБОТЫ С GEMINI API ===

// Анализ текста заявки
async function analyzeTextWithGemini(apiKey: string, text: string): Promise<GeminiAnalysis> {
  const prompt = `
Проанализируй заявку на изменение проектной документации и классифицируй её по следующим критериям:

ТЕКСТ ЗАЯВКИ:
"${text}"

Верни результат в формате JSON:
{
  "category": "техническая_ошибка|дополнение_документации|нормативные_изменения|экономическое_обоснование|прочее",
  "urgency_level": 1-3 (1-срочно, 2-обычно, 3-низкий приоритет),
  "change_type": "исправление_ошибок|дополнение|корректировка|новый_раздел",
  "doc_section": "фундаменты|стены|кровля|электроснабжение|водоснабжение|отопление|пояснительная_записка|прочее",
  "summary": "краткое описание сути заявки"
}

При анализе учитывай:
- Ключевые слова для определения срочности: "срочно", "критично", "блокирует работу"
- Технические термины для определения раздела документации
- Тип запрашиваемого изменения (исправление, дополнение, etc.)
  `
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-002:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.2,
            topK: 40,
            topP: 0.8,
            maxOutputTokens: 8192
          }
        })
      }
    )
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${data.error?.message || 'Unknown error'}`)
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      throw new Error('No content in Gemini response')
    }
    
    // Парсим JSON ответ
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    const jsonString = content.substring(jsonStart, jsonEnd)
    
    const analysis = JSON.parse(jsonString)
    
    // Валидация и значения по умолчанию
    return {
      category: analysis.category || 'прочее',
      urgency_level: analysis.urgency_level || 2,
      change_type: analysis.change_type || 'прочее',
      doc_section: analysis.doc_section || 'прочее',
      summary: analysis.summary || text.substring(0, 100)
    }
  } catch (error) {
    console.error('Gemini analysis error:', error)
    // Возвращаем базовые значения при ошибке
    return {
      category: 'прочее',
      urgency_level: 2,
      change_type: 'прочее',
      doc_section: 'прочее',
      summary: text.substring(0, 100)
    }
  }
}

// Транскрипция аудио (заглушка - Gemini пока не поддерживает аудио через REST API)
async function transcribeAudioWithGemini(apiKey: string, audioUrl: string) {
  // ВНИМАНИЕ: На данный момент Gemini API не поддерживает обработку аудио через REST
  // Для реализации транскрипции нужно использовать другие сервисы:
  // - Google Speech-to-Text API
  // - OpenAI Whisper API  
  // - Yandex SpeechKit
  
  console.log('Audio transcription placeholder:', audioUrl)
  
  return {
    text: '[Транскрипция аудио временно недоступна - используйте текстовые сообщения]',
    confidence: 0,
    language: 'ru'
  }
}

// Объединение заявок в письмо
async function combineRequestsWithGemini(apiKey: string, requests: any[], title?: string) {
  const prompt = `
Составь официальное письмо заказчику об изменениях в проектной документации на основе следующих заявок:

ЗАЯВКИ:
${requests.map((req, index) => `
${index + 1}. Заявка №${req.id} от ${req.author} (${req.date})
   Категория: ${req.category}
   Тип изменения: ${req.changeType}
   Раздел: ${req.docSection}
   Текст: ${req.text}
`).join('\n')}

Требования к письму:
1. Официальный деловой стиль
2. Структура по разделам документации
3. Нумерация изменений внутри каждого раздела
4. Указание авторов и дат поступления заявок
5. Обоснование необходимости изменений
6. Заключение с просьбой о согласовании

Заголовок письма: "${title || 'О внесении изменений в проектную документацию'}"

Верни результат в формате JSON:
{
  "content": "полный текст письма в HTML формате",
  "sections": ["список разделов документации которые затрагиваются"],
  "totalChanges": количество изменений,
  "priority": "высокий|средний|низкий"
}
  `
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-002:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.3,
            topK: 40,
            topP: 0.8,
            maxOutputTokens: 8192
          }
        })
      }
    )
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${data.error?.message || 'Unknown error'}`)
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      throw new Error('No content in Gemini response')
    }
    
    // Парсим JSON ответ
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    const jsonString = content.substring(jsonStart, jsonEnd)
    
    return JSON.parse(jsonString)
  } catch (error) {
    console.error('Letter combination error:', error)
    
    // Fallback - создаем письмо вручную
    const sectionsMap = new Map()
    requests.forEach(req => {
      const section = req.docSection || 'Прочие изменения'
      if (!sectionsMap.has(section)) {
        sectionsMap.set(section, [])
      }
      sectionsMap.get(section).push(req)
    })
    
    let content = `
    <h2>${title || 'О внесении изменений в проектную документацию'}</h2>
    <p>На основании поступивших заявок на изменение проектной документации просим рассмотреть следующие корректировки:</p>
    `
    
    Array.from(sectionsMap.entries()).forEach(([section, sectionRequests], sectionIndex) => {
      content += `<h3>${sectionIndex + 1}. Раздел "${section}"</h3><ul>`
      sectionRequests.forEach((req: any, reqIndex: number) => {
        content += `<li>${reqIndex + 1}.${sectionIndex + 1}. ${req.text}<br><small>Автор: ${req.author}, дата: ${req.date}</small></li>`
      })
      content += '</ul>'
    })
    
    content += `
    <p>Всего изменений: ${requests.length}</p>
    <p>Просим рассмотреть предложенные изменения и дать согласование на внесение корректировок в проектную документацию.</p>
    `
    
    return {
      content,
      sections: Array.from(sectionsMap.keys()),
      totalChanges: requests.length,
      priority: 'средний'
    }
  }
}

// Улучшение текста
async function improveTextWithGemini(apiKey: string, text: string, context?: string) {
  const prompt = `
Улучши следующий текст официального письма, сделав его более профессиональным и структурированным:

ИСХОДНЫЙ ТЕКСТ:
"${text}"

КОНТЕКСТ: ${context || 'Официальная корреспонденция по проектной документации'}

Верни результат в формате JSON:
{
  "content": "улучшенный текст",
  "improvements": ["список конкретных улучшений"]
}

Критерии улучшения:
- Деловой официальный стиль
- Четкая структура и логика изложения  
- Правильная терминология
- Убедительная аргументация
- Корректное оформление
  `
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-002:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            temperature: 0.4,
            topK: 40,
            topP: 0.8,
            maxOutputTokens: 8192
          }
        })
      }
    )
    
    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(`Gemini API error: ${data.error?.message || 'Unknown error'}`)
    }
    
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!content) {
      throw new Error('No content in Gemini response')
    }
    
    const jsonStart = content.indexOf('{')
    const jsonEnd = content.lastIndexOf('}') + 1
    const jsonString = content.substring(jsonStart, jsonEnd)
    
    return JSON.parse(jsonString)
  } catch (error) {
    console.error('Text improvement error:', error)
    return {
      content: text,
      improvements: ['Ошибка улучшения текста через AI']
    }
  }
}

export default app