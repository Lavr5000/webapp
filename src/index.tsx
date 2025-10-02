import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { renderer } from './renderer'
import { CloudflareBindings } from './types'

// Import route handlers
import requestsAPI from './routes/requests'
import telegramAPI from './routes/telegram'
import geminiAPI from './routes/gemini'
import emailAPI from './routes/email'
import lettersAPI from './routes/letters'

const app = new Hono<{ Bindings: CloudflareBindings }>()

// Middleware
app.use('*', logger())
app.use('/api/*', cors())
app.use(renderer)

// API Routes
app.route('/api/requests', requestsAPI)
app.route('/api/telegram', telegramAPI)
app.route('/api/gemini', geminiAPI)
app.route('/api/email', emailAPI)
app.route('/api/letters', lettersAPI)

// Health check
app.get('/api/health', (c) => {
  return c.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: c.env?.ENVIRONMENT || 'development'
  })
})

// Admin panel page
app.get('/admin', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Административная панель - Управление заявками</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-100">
        <nav class="bg-blue-800 text-white p-4">
            <div class="max-w-7xl mx-auto flex justify-between items-center">
                <div class="flex items-center space-x-4">
                    <a href="/" class="text-xl font-bold hover:text-blue-200">
                        <i class="fas fa-file-edit mr-2"></i>Управление заявками
                    </a>
                    <span class="text-blue-200">→ Административная панель</span>
                </div>
                <div class="flex space-x-4">
                    <a href="/manager" class="hover:text-blue-200">
                        <i class="fas fa-user-tie mr-1"></i>Согласование
                    </a>
                    <a href="/" class="hover:text-blue-200">
                        <i class="fas fa-home mr-1"></i>Главная
                    </a>
                </div>
            </div>
        </nav>

        <div class="max-w-7xl mx-auto p-6">
            <!-- Статистика -->
            <div class="grid md:grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-blue-100 text-blue-600">
                            <i class="fas fa-inbox text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">Новые заявки</h3>
                            <p class="text-2xl font-bold text-blue-600" id="new-requests">-</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-yellow-100 text-yellow-600">
                            <i class="fas fa-eye text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">На рассмотрении</h3>
                            <p class="text-2xl font-bold text-yellow-600" id="pending-requests">-</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-green-100 text-green-600">
                            <i class="fas fa-check text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">Одобрено</h3>
                            <p class="text-2xl font-bold text-green-600" id="approved-requests">-</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-purple-100 text-purple-600">
                            <i class="fas fa-envelope text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">Отправлено</h3>
                            <p class="text-2xl font-bold text-purple-600" id="completed-requests">-</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Фильтры и управление -->
            <div class="bg-white rounded-lg shadow p-6 mb-6">
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <div class="flex flex-wrap gap-4">
                        <select id="status-filter" class="border rounded-lg px-3 py-2">
                            <option value="">Все статусы</option>
                            <option value="новая">Новые</option>
                            <option value="на_рассмотрении">На рассмотрении</option>
                            <option value="одобрена">Одобренные</option>
                            <option value="отклонена">Отклоненные</option>
                            <option value="в_работе">В работе</option>
                            <option value="завершена">Завершенные</option>
                        </select>

                        <select id="category-filter" class="border rounded-lg px-3 py-2">
                            <option value="">Все категории</option>
                            <option value="техническая_ошибка">Технические ошибки</option>
                            <option value="дополнение_документации">Дополнения</option>
                            <option value="нормативные_изменения">Нормативные изменения</option>
                            <option value="экономическое_обоснование">Экономические</option>
                        </select>

                        <button id="refresh-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-sync-alt mr-2"></i>Обновить
                        </button>
                    </div>

                    <div class="flex gap-4">
                        <button id="approve-selected-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                            <i class="fas fa-check mr-2"></i>Одобрить выбранные
                        </button>

                        <button id="create-letter-btn" class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                            <i class="fas fa-envelope mr-2"></i>Создать письмо
                        </button>
                    </div>
                </div>
            </div>

            <!-- Таблица заявок -->
            <div class="bg-white rounded-lg shadow overflow-hidden">
                <div class="px-6 py-4 bg-gray-50 border-b">
                    <h2 class="text-xl font-bold">Заявки на изменение документации</h2>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 border-b">
                            <tr>
                                <th class="p-4 text-left">
                                    <input type="checkbox" id="select-all" class="rounded">
                                </th>
                                <th class="p-4 text-left">ID</th>
                                <th class="p-4 text-left">Дата</th>
                                <th class="p-4 text-left">Отправитель</th>
                                <th class="p-4 text-left">Текст заявки</th>
                                <th class="p-4 text-left">Категория</th>
                                <th class="p-4 text-left">Статус</th>
                                <th class="p-4 text-left">Действия</th>
                            </tr>
                        </thead>
                        <tbody id="requests-table-body">
                            <tr>
                                <td colspan="8" class="p-8 text-center text-gray-500">
                                    <i class="fas fa-spinner fa-spin text-2xl mb-4"></i><br>
                                    Загрузка заявок...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Пагинация -->
            <div class="flex justify-between items-center mt-6">
                <div class="text-gray-600" id="pagination-info">
                    Показано: 0 заявок
                </div>
                <div class="flex space-x-2" id="pagination-controls">
                    <button class="px-4 py-2 border rounded-lg disabled:opacity-50" id="prev-page" disabled>
                        <i class="fas fa-chevron-left"></i> Назад
                    </button>
                    <button class="px-4 py-2 border rounded-lg disabled:opacity-50" id="next-page" disabled>
                        Далее <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            </div>
        </div>

        <!-- Модальное окно для просмотра/редактирования заявки -->
        <div id="request-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
            <div class="flex items-center justify-center min-h-screen p-4">
                <div class="bg-white rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
                    <div class="p-6 border-b">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xl font-bold" id="modal-title">Заявка №</h3>
                            <button id="close-modal" class="text-gray-400 hover:text-gray-600">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="p-6" id="modal-content">
                        <!-- Содержимое будет загружено динамически -->
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            // Инициализация приложения
            class AdminPanel {
                constructor() {
                    this.currentPage = 0;
                    this.pageSize = 20;
                    this.selectedRequests = new Set();
                    this.init();
                }

                init() {
                    this.loadStatistics();
                    this.loadRequests();
                    this.setupEventListeners();
                }

                setupEventListeners() {
                    // Фильтры
                    document.getElementById('status-filter').addEventListener('change', () => this.loadRequests());
                    document.getElementById('category-filter').addEventListener('change', () => this.loadRequests());
                    document.getElementById('refresh-btn').addEventListener('click', () => this.loadRequests());

                    // Пагинация
                    document.getElementById('prev-page').addEventListener('click', () => this.prevPage());
                    document.getElementById('next-page').addEventListener('click', () => this.nextPage());

                    // Выбор всех заявок
                    document.getElementById('select-all').addEventListener('change', (e) => this.selectAll(e.target.checked));

                    // Массовые действия
                    document.getElementById('approve-selected-btn').addEventListener('click', () => this.approveSelected());
                    document.getElementById('create-letter-btn').addEventListener('click', () => this.createLetter());

                    // Модальное окно
                    document.getElementById('close-modal').addEventListener('click', () => this.closeModal());
                }

                async loadStatistics() {
                    try {
                        const response = await axios.get('/api/requests/stats/overview');
                        if (response.data.success) {
                            const stats = response.data.data.byStatus;
                            
                            // Обновляем счетчики
                            document.getElementById('new-requests').textContent = 
                                this.getStatCount(stats, 'новая');
                            document.getElementById('pending-requests').textContent = 
                                this.getStatCount(stats, 'на_рассмотрении');
                            document.getElementById('approved-requests').textContent = 
                                this.getStatCount(stats, 'одобрена');
                            document.getElementById('completed-requests').textContent = 
                                this.getStatCount(stats, 'завершена');
                        }
                    } catch (error) {
                        console.error('Error loading statistics:', error);
                    }
                }

                getStatCount(stats, status) {
                    const stat = stats.find(s => s.status === status);
                    return stat ? stat.count : 0;
                }

                async loadRequests() {
                    const tbody = document.getElementById('requests-table-body');
                    tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center"><i class="fas fa-spinner fa-spin"></i> Загрузка...</td></tr>';

                    try {
                        const params = new URLSearchParams({
                            limit: this.pageSize,
                            offset: this.currentPage * this.pageSize
                        });

                        const status = document.getElementById('status-filter').value;
                        const category = document.getElementById('category-filter').value;
                        
                        if (status) params.append('status', status);
                        if (category) params.append('category', category);

                        const response = await axios.get('/api/requests?' + params);
                        
                        if (response.data.success) {
                            this.renderRequests(response.data.data);
                            this.updatePagination(response.data.data.length);
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error loading requests:', error);
                        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-red-500">Ошибка загрузки заявок</td></tr>';
                    }
                }

                renderRequests(requests) {
                    const tbody = document.getElementById('requests-table-body');
                    
                    if (requests.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="8" class="p-8 text-center text-gray-500">Заявки не найдены</td></tr>';
                        return;
                    }

                    tbody.innerHTML = requests.map(request => {
                        const date = new Date(request.created_at).toLocaleDateString('ru-RU');
                        const statusBadge = this.getStatusBadge(request.status);
                        const categoryBadge = this.getCategoryBadge(request.category);
                        
                        return \`
                            <tr class="border-b hover:bg-gray-50">
                                <td class="p-4">
                                    <input type="checkbox" value="\${request.id}" class="request-checkbox rounded" 
                                           onchange="adminPanel.toggleRequest(\${request.id}, this.checked)">
                                </td>
                                <td class="p-4 font-mono">\${request.id}</td>
                                <td class="p-4">\${date}</td>
                                <td class="p-4">
                                    <div>
                                        <div class="font-medium">\${request.user_name}</div>
                                        \${request.telegram_username ? '<div class="text-sm text-gray-500">@' + request.telegram_username + '</div>' : ''}
                                    </div>
                                </td>
                                <td class="p-4 max-w-xs">
                                    <div class="truncate" title="\${request.message_text}">
                                        \${request.message_text}
                                    </div>
                                    \${request.audio_file_url ? '<div class="text-sm text-blue-600"><i class="fas fa-volume-up"></i> Голосовое</div>' : ''}
                                </td>
                                <td class="p-4">\${categoryBadge}</td>
                                <td class="p-4">\${statusBadge}</td>
                                <td class="p-4">
                                    <div class="flex space-x-2">
                                        <button onclick="adminPanel.viewRequest(\${request.id})" 
                                                class="text-blue-600 hover:text-blue-800" title="Просмотр">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button onclick="adminPanel.editRequest(\${request.id})" 
                                                class="text-green-600 hover:text-green-800" title="Редактировать">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        \`;
                    }).join('');
                }

                getStatusBadge(status) {
                    const badges = {
                        'новая': '<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">Новая</span>',
                        'на_рассмотрении': '<span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">На рассмотрении</span>',
                        'одобрена': '<span class="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Одобрена</span>',
                        'отклонена': '<span class="px-2 py-1 bg-red-100 text-red-800 rounded-full text-xs">Отклонена</span>',
                        'в_работе': '<span class="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">В работе</span>',
                        'завершена': '<span class="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">Завершена</span>'
                    };
                    return badges[status] || status;
                }

                getCategoryBadge(category) {
                    if (!category) return '<span class="text-gray-400">-</span>';
                    
                    const badges = {
                        'техническая_ошибка': '<span class="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">Тех. ошибка</span>',
                        'дополнение_документации': '<span class="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">Дополнение</span>',
                        'нормативные_изменения': '<span class="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">Нормативы</span>',
                        'экономическое_обоснование': '<span class="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">Экономика</span>'
                    };
                    return badges[category] || category;
                }

                toggleRequest(id, checked) {
                    if (checked) {
                        this.selectedRequests.add(id);
                    } else {
                        this.selectedRequests.delete(id);
                    }
                    
                    // Обновляем состояние кнопок
                    const approveBtn = document.getElementById('approve-selected-btn');
                    const letterBtn = document.getElementById('create-letter-btn');
                    
                    approveBtn.disabled = this.selectedRequests.size === 0;
                    letterBtn.disabled = this.selectedRequests.size === 0;
                }

                selectAll(checked) {
                    const checkboxes = document.querySelectorAll('.request-checkbox');
                    checkboxes.forEach(cb => {
                        cb.checked = checked;
                        this.toggleRequest(parseInt(cb.value), checked);
                    });
                }

                async approveSelected() {
                    if (this.selectedRequests.size === 0) return;

                    try {
                        for (const id of this.selectedRequests) {
                            await axios.put(\`/api/requests/\${id}\`, {
                                status: 'одобрена',
                                is_approved: true
                            });
                        }
                        
                        this.selectedRequests.clear();
                        this.loadRequests();
                        this.loadStatistics();
                        
                        alert('Выбранные заявки одобрены');
                    } catch (error) {
                        console.error('Error approving requests:', error);
                        alert('Ошибка одобрения заявок');
                    }
                }

                async createLetter() {
                    if (this.selectedRequests.size === 0) return;

                    try {
                        const title = prompt('Введите заголовок письма:', 'Заявки на изменение проектной документации');
                        if (!title) return;

                        const response = await axios.post('/api/gemini/combine', {
                            requestIds: Array.from(this.selectedRequests),
                            title: title
                        });

                        if (response.data.success) {
                            alert(\`Письмо создано (ID: \${response.data.data.letterId})\`);
                            this.selectedRequests.clear();
                            this.loadRequests();
                            this.loadStatistics();
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error creating letter:', error);
                        alert('Ошибка создания письма');
                    }
                }

                async viewRequest(id) {
                    try {
                        const response = await axios.get(\`/api/requests/\${id}\`);
                        if (response.data.success) {
                            this.showRequestModal(response.data.data, 'view');
                        }
                    } catch (error) {
                        console.error('Error loading request:', error);
                        alert('Ошибка загрузки заявки');
                    }
                }

                async editRequest(id) {
                    try {
                        const response = await axios.get(\`/api/requests/\${id}\`);
                        if (response.data.success) {
                            this.showRequestModal(response.data.data, 'edit');
                        }
                    } catch (error) {
                        console.error('Error loading request:', error);
                        alert('Ошибка загрузки заявки');
                    }
                }

                showRequestModal(request, mode) {
                    const modal = document.getElementById('request-modal');
                    const title = document.getElementById('modal-title');
                    const content = document.getElementById('modal-content');

                    title.textContent = \`Заявка №\${request.id}\`;
                    
                    if (mode === 'view') {
                        content.innerHTML = this.renderRequestView(request);
                    } else {
                        content.innerHTML = this.renderRequestEdit(request);
                    }

                    modal.classList.remove('hidden');
                }

                renderRequestView(request) {
                    const date = new Date(request.created_at).toLocaleString('ru-RU');
                    
                    return \`
                        <div class="space-y-4">
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Отправитель</label>
                                    <p class="mt-1">\${request.user_name}</p>
                                    \${request.telegram_username ? '<p class="text-sm text-gray-500">@' + request.telegram_username + '</p>' : ''}
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Дата создания</label>
                                    <p class="mt-1">\${date}</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Статус</label>
                                    <p class="mt-1">\${this.getStatusBadge(request.status)}</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Категория</label>
                                    <p class="mt-1">\${this.getCategoryBadge(request.category)}</p>
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Текст заявки</label>
                                <div class="mt-1 p-3 bg-gray-50 rounded border">
                                    \${request.message_text}
                                </div>
                            </div>

                            \${request.transcribed_text ? \`
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Расшифровка голосового сообщения</label>
                                    <div class="mt-1 p-3 bg-blue-50 rounded border">
                                        \${request.transcribed_text}
                                    </div>
                                </div>
                            \` : ''}

                            \${request.admin_comment ? \`
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Комментарий администратора</label>
                                    <div class="mt-1 p-3 bg-yellow-50 rounded border">
                                        \${request.admin_comment}
                                    </div>
                                </div>
                            \` : ''}
                        </div>
                    \`;
                }

                renderRequestEdit(request) {
                    return \`
                        <form id="edit-request-form" class="space-y-4">
                            <input type="hidden" name="id" value="\${request.id}">
                            
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Статус</label>
                                    <select name="status" class="mt-1 block w-full border rounded-lg px-3 py-2">
                                        <option value="новая" \${request.status === 'новая' ? 'selected' : ''}>Новая</option>
                                        <option value="на_рассмотрении" \${request.status === 'на_рассмотрении' ? 'selected' : ''}>На рассмотрении</option>
                                        <option value="одобрена" \${request.status === 'одобрена' ? 'selected' : ''}>Одобрена</option>
                                        <option value="отклонена" \${request.status === 'отклонена' ? 'selected' : ''}>Отклонена</option>
                                        <option value="в_работе" \${request.status === 'в_работе' ? 'selected' : ''}>В работе</option>
                                        <option value="завершена" \${request.status === 'завершена' ? 'selected' : ''}>Завершена</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Категория</label>
                                    <select name="category" class="mt-1 block w-full border rounded-lg px-3 py-2">
                                        <option value="">Не выбрана</option>
                                        <option value="техническая_ошибка" \${request.category === 'техническая_ошибка' ? 'selected' : ''}>Техническая ошибка</option>
                                        <option value="дополнение_документации" \${request.category === 'дополнение_документации' ? 'selected' : ''}>Дополнение документации</option>
                                        <option value="нормативные_изменения" \${request.category === 'нормативные_изменения' ? 'selected' : ''}>Нормативные изменения</option>
                                        <option value="экономическое_обоснование" \${request.category === 'экономическое_обоснование' ? 'selected' : ''}>Экономическое обоснование</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700">Комментарий администратора</label>
                                <textarea name="admin_comment" class="mt-1 block w-full border rounded-lg px-3 py-2 h-24" 
                                          placeholder="Оставьте комментарий...">\${request.admin_comment || ''}</textarea>
                            </div>

                            <div class="flex justify-end space-x-3">
                                <button type="button" onclick="adminPanel.closeModal()" 
                                        class="px-4 py-2 border rounded-lg hover:bg-gray-50">
                                    Отмена
                                </button>
                                <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                    Сохранить
                                </button>
                            </div>
                        </form>
                    \`;
                }

                closeModal() {
                    document.getElementById('request-modal').classList.add('hidden');
                }

                updatePagination(count) {
                    const info = document.getElementById('pagination-info');
                    const start = this.currentPage * this.pageSize + 1;
                    const end = Math.min(start + count - 1, start + this.pageSize - 1);
                    
                    info.textContent = count > 0 ? \`Показано: \${start}-\${end} из \${count} заявок\` : 'Заявки не найдены';
                    
                    document.getElementById('prev-page').disabled = this.currentPage === 0;
                    document.getElementById('next-page').disabled = count < this.pageSize;
                }

                prevPage() {
                    if (this.currentPage > 0) {
                        this.currentPage--;
                        this.loadRequests();
                    }
                }

                nextPage() {
                    this.currentPage++;
                    this.loadRequests();
                }
            }

            // Инициализация
            const adminPanel = new AdminPanel();

            // Обработчик формы редактирования
            document.addEventListener('submit', async (e) => {
                if (e.target.id === 'edit-request-form') {
                    e.preventDefault();
                    
                    const formData = new FormData(e.target);
                    const data = Object.fromEntries(formData.entries());
                    
                    try {
                        const response = await axios.put(\`/api/requests/\${data.id}\`, {
                            status: data.status,
                            category: data.category || null,
                            admin_comment: data.admin_comment || null,
                            is_approved: data.status === 'одобрена'
                        });
                        
                        if (response.data.success) {
                            adminPanel.closeModal();
                            adminPanel.loadRequests();
                            adminPanel.loadStatistics();
                            alert('Заявка обновлена');
                        }
                    } catch (error) {
                        console.error('Error updating request:', error);
                        alert('Ошибка обновления заявки');
                    }
                }
            });
        </script>
    </body>
    </html>
  `)
})

// Manager approval page
app.get('/manager', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Страница согласования - Управление заявками</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-100">
        <nav class="bg-green-700 text-white p-4">
            <div class="max-w-6xl mx-auto flex justify-between items-center">
                <div class="flex items-center space-x-4">
                    <a href="/" class="text-xl font-bold hover:text-green-200">
                        <i class="fas fa-file-signature mr-2"></i>Согласование документов
                    </a>
                    <span class="text-green-200">→ Страница руководителя</span>
                </div>
                <div class="flex space-x-4">
                    <a href="/admin" class="hover:text-green-200">
                        <i class="fas fa-cogs mr-1"></i>Админ панель
                    </a>
                    <a href="/" class="hover:text-green-200">
                        <i class="fas fa-home mr-1"></i>Главная
                    </a>
                </div>
            </div>
        </nav>

        <div class="max-w-6xl mx-auto p-6">
            <!-- Статистика писем -->
            <div class="grid md:grid-cols-4 gap-6 mb-8">
                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-yellow-100 text-yellow-600">
                            <i class="fas fa-clock text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">На согласовании</h3>
                            <p class="text-2xl font-bold text-yellow-600" id="pending-letters">-</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-blue-100 text-blue-600">
                            <i class="fas fa-edit text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">Черновики</h3>
                            <p class="text-2xl font-bold text-blue-600" id="draft-letters">-</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-green-100 text-green-600">
                            <i class="fas fa-signature text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">Подписано</h3>
                            <p class="text-2xl font-bold text-green-600" id="signed-letters">-</p>
                        </div>
                    </div>
                </div>

                <div class="bg-white p-6 rounded-lg shadow">
                    <div class="flex items-center">
                        <div class="p-3 rounded-full bg-purple-100 text-purple-600">
                            <i class="fas fa-paper-plane text-xl"></i>
                        </div>
                        <div class="ml-4">
                            <h3 class="text-lg font-semibold">Отправлено</h3>
                            <p class="text-2xl font-bold text-purple-600" id="sent-letters">-</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Фильтры -->
            <div class="bg-white rounded-lg shadow p-6 mb-6">
                <div class="flex items-center justify-between">
                    <div class="flex gap-4">
                        <select id="status-filter" class="border rounded-lg px-3 py-2">
                            <option value="">Все статусы</option>
                            <option value="на_согласовании">На согласовании</option>
                            <option value="черновик">Черновики</option>
                            <option value="подписан">Подписанные</option>
                            <option value="отправлен">Отправленные</option>
                        </select>

                        <button id="refresh-btn" class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                            <i class="fas fa-sync-alt mr-2"></i>Обновить
                        </button>
                    </div>
                </div>
            </div>

            <!-- Список писем -->
            <div class="space-y-6" id="letters-container">
                <div class="text-center py-8">
                    <i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i>
                    <p class="text-gray-500 mt-2">Загрузка писем...</p>
                </div>
            </div>
        </div>

        <!-- Модальное окно для просмотра письма -->
        <div id="letter-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50">
            <div class="flex items-center justify-center min-h-screen p-4">
                <div class="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
                    <div class="p-6 border-b">
                        <div class="flex justify-between items-center">
                            <h3 class="text-xl font-bold" id="modal-letter-title">Письмо</h3>
                            <button id="close-letter-modal" class="text-gray-400 hover:text-gray-600">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="p-6" id="modal-letter-content">
                        <!-- Содержимое будет загружено динамически -->
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            class ManagerPanel {
                constructor() {
                    this.currentLetter = null;
                    this.init();
                }

                init() {
                    this.loadStatistics();
                    this.loadLetters();
                    this.setupEventListeners();
                }

                setupEventListeners() {
                    document.getElementById('status-filter').addEventListener('change', () => this.loadLetters());
                    document.getElementById('refresh-btn').addEventListener('click', () => this.loadLetters());
                    document.getElementById('close-letter-modal').addEventListener('click', () => this.closeModal());
                }

                async loadStatistics() {
                    try {
                        const response = await axios.get('/api/letters/stats/overview');
                        if (response.data.success) {
                            const stats = response.data.data.byStatus;
                            
                            document.getElementById('pending-letters').textContent = 
                                this.getStatCount(stats, 'на_согласовании');
                            document.getElementById('draft-letters').textContent = 
                                this.getStatCount(stats, 'черновик');
                            document.getElementById('signed-letters').textContent = 
                                this.getStatCount(stats, 'подписан');
                            document.getElementById('sent-letters').textContent = 
                                this.getStatCount(stats, 'отправлен');
                        }
                    } catch (error) {
                        console.error('Error loading statistics:', error);
                    }
                }

                getStatCount(stats, status) {
                    const stat = stats.find(s => s.status === status);
                    return stat ? stat.count : 0;
                }

                async loadLetters() {
                    const container = document.getElementById('letters-container');
                    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-gray-400"></i><p class="text-gray-500 mt-2">Загрузка...</p></div>';

                    try {
                        const status = document.getElementById('status-filter').value;
                        const params = status ? \`?status=\${status}\` : '';
                        
                        const response = await axios.get('/api/letters' + params);
                        
                        if (response.data.success) {
                            this.renderLetters(response.data.data);
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error loading letters:', error);
                        container.innerHTML = '<div class="text-center py-8 text-red-500">Ошибка загрузки писем</div>';
                    }
                }

                renderLetters(letters) {
                    const container = document.getElementById('letters-container');
                    
                    if (letters.length === 0) {
                        container.innerHTML = '<div class="text-center py-8 text-gray-500">Письма не найдены</div>';
                        return;
                    }

                    container.innerHTML = letters.map(letter => {
                        const date = new Date(letter.created_at).toLocaleString('ru-RU');
                        const requestCount = JSON.parse(letter.request_ids).length;
                        const statusBadge = this.getStatusBadge(letter.status);
                        
                        return \`
                            <div class="bg-white rounded-lg shadow p-6">
                                <div class="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 class="text-xl font-semibold mb-2">\${letter.title}</h3>
                                        <div class="text-gray-600 space-x-4">
                                            <span><i class="fas fa-calendar mr-1"></i>\${date}</span>
                                            <span><i class="fas fa-file-alt mr-1"></i>\${requestCount} заявок</span>
                                        </div>
                                    </div>
                                    <div class="text-right">
                                        \${statusBadge}
                                    </div>
                                </div>

                                \${letter.manager_comment ? \`
                                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                                        <p class="text-sm"><strong>Комментарий:</strong> \${letter.manager_comment}</p>
                                    </div>
                                \` : ''}

                                <div class="flex justify-between items-center">
                                    <button onclick="managerPanel.viewLetter(\${letter.id})" 
                                            class="text-blue-600 hover:text-blue-800">
                                        <i class="fas fa-eye mr-1"></i>Просмотр
                                    </button>
                                    
                                    <div class="space-x-2">
                                        \${letter.status === 'на_согласовании' ? \`
                                            <button onclick="managerPanel.signLetter(\${letter.id})" 
                                                    class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                                                <i class="fas fa-signature mr-1"></i>Подписать
                                            </button>
                                            <button onclick="managerPanel.rejectLetter(\${letter.id})" 
                                                    class="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">
                                                <i class="fas fa-times mr-1"></i>Отклонить
                                            </button>
                                        \` : ''}
                                        
                                        \${letter.status === 'подписан' ? \`
                                            <button onclick="managerPanel.sendLetter(\${letter.id})" 
                                                    class="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700">
                                                <i class="fas fa-paper-plane mr-1"></i>Отправить
                                            </button>
                                        \` : ''}
                                    </div>
                                </div>
                            </div>
                        \`;
                    }).join('');
                }

                getStatusBadge(status) {
                    const badges = {
                        'черновик': '<span class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">Черновик</span>',
                        'на_согласовании': '<span class="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">На согласовании</span>',
                        'подписан': '<span class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">Подписано</span>',
                        'отправлен': '<span class="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm">Отправлено</span>'
                    };
                    return badges[status] || status;
                }

                async viewLetter(id) {
                    try {
                        const response = await axios.get(\`/api/letters/\${id}\`);
                        if (response.data.success) {
                            this.showLetterModal(response.data.data);
                        }
                    } catch (error) {
                        console.error('Error loading letter:', error);
                        alert('Ошибка загрузки письма');
                    }
                }

                showLetterModal(letter) {
                    this.currentLetter = letter;
                    const modal = document.getElementById('letter-modal');
                    const title = document.getElementById('modal-letter-title');
                    const content = document.getElementById('modal-letter-content');

                    title.textContent = letter.title;
                    
                    const date = new Date(letter.created_at).toLocaleString('ru-RU');
                    const requestCount = letter.relatedRequests ? letter.relatedRequests.length : JSON.parse(letter.request_ids).length;
                    
                    content.innerHTML = \`
                        <div class="space-y-6">
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Дата создания</label>
                                    <p class="mt-1">\${date}</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Количество заявок</label>
                                    <p class="mt-1">\${requestCount}</p>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Статус</label>
                                    <p class="mt-1">\${this.getStatusBadge(letter.status)}</p>
                                </div>
                                \${letter.recipient_email ? \`
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700">Email получателя</label>
                                        <p class="mt-1">\${letter.recipient_email}</p>
                                    </div>
                                \` : ''}
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700">Содержание письма</label>
                                <div class="mt-1 p-4 bg-gray-50 rounded border max-h-96 overflow-y-auto">
                                    \${letter.content}
                                </div>
                            </div>

                            \${letter.relatedRequests ? \`
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">Связанные заявки</label>
                                    <div class="mt-1 space-y-2">
                                        \${letter.relatedRequests.map(req => \`
                                            <div class="p-3 bg-blue-50 rounded border">
                                                <div class="flex justify-between items-start">
                                                    <div>
                                                        <p class="font-medium">№\${req.id} - \${req.user_name}</p>
                                                        <p class="text-sm text-gray-600">\${req.message_text}</p>
                                                    </div>
                                                    <span class="text-xs text-gray-500">
                                                        \${new Date(req.created_at).toLocaleDateString('ru-RU')}
                                                    </span>
                                                </div>
                                            </div>
                                        \`).join('')}
                                    </div>
                                </div>
                            \` : ''}

                            \${letter.status === 'на_согласовании' ? \`
                                <div class="border-t pt-4">
                                    <div class="flex space-x-4">
                                        <button onclick="managerPanel.signCurrentLetter()" 
                                                class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">
                                            <i class="fas fa-signature mr-2"></i>Подписать письмо
                                        </button>
                                        <button onclick="managerPanel.rejectCurrentLetter()" 
                                                class="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700">
                                            <i class="fas fa-times mr-2"></i>Отклонить
                                        </button>
                                    </div>
                                </div>
                            \` : ''}

                            \${letter.status === 'подписан' ? \`
                                <div class="border-t pt-4">
                                    <div class="space-y-4">
                                        <div>
                                            <label class="block text-sm font-medium text-gray-700">Email получателя *</label>
                                            <input type="email" id="recipient-email" placeholder="client@example.com" 
                                                   value="\${letter.recipient_email || ''}"
                                                   class="mt-1 block w-full border rounded-lg px-3 py-2">
                                        </div>
                                        <button onclick="managerPanel.sendCurrentLetter()" 
                                                class="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700">
                                            <i class="fas fa-paper-plane mr-2"></i>Отправить письмо
                                        </button>
                                    </div>
                                </div>
                            \` : ''}
                        </div>
                    \`;

                    modal.classList.remove('hidden');
                }

                closeModal() {
                    document.getElementById('letter-modal').classList.add('hidden');
                    this.currentLetter = null;
                }

                async signLetter(id) {
                    const comment = prompt('Комментарий к подписанию (необязательно):');
                    
                    try {
                        const response = await axios.post(\`/api/letters/\${id}/sign\`, {
                            manager_comment: comment
                        });

                        if (response.data.success) {
                            alert('Письмо подписано');
                            this.loadLetters();
                            this.loadStatistics();
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error signing letter:', error);
                        alert('Ошибка подписания письма');
                    }
                }

                async rejectLetter(id) {
                    const reason = prompt('Причина отклонения:');
                    if (!reason) return;
                    
                    try {
                        const response = await axios.post(\`/api/letters/\${id}/reject\`, {
                            reason: reason
                        });

                        if (response.data.success) {
                            alert('Письмо отклонено');
                            this.loadLetters();
                            this.loadStatistics();
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error rejecting letter:', error);
                        alert('Ошибка отклонения письма');
                    }
                }

                async sendLetter(id) {
                    const email = prompt('Email получателя:', '');
                    if (!email) return;
                    
                    try {
                        const response = await axios.post('/api/email/send-letter', {
                            letterId: id,
                            recipientEmail: email
                        });

                        if (response.data.success) {
                            alert('Письмо отправлено');
                            this.loadLetters();
                            this.loadStatistics();
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error sending letter:', error);
                        alert('Ошибка отправки письма');
                    }
                }

                async signCurrentLetter() {
                    if (!this.currentLetter) return;
                    await this.signLetter(this.currentLetter.id);
                    this.closeModal();
                }

                async rejectCurrentLetter() {
                    if (!this.currentLetter) return;
                    await this.rejectLetter(this.currentLetter.id);
                    this.closeModal();
                }

                async sendCurrentLetter() {
                    if (!this.currentLetter) return;
                    
                    const emailInput = document.getElementById('recipient-email');
                    const email = emailInput.value.trim();
                    
                    if (!email) {
                        alert('Введите email получателя');
                        return;
                    }
                    
                    try {
                        const response = await axios.post('/api/email/send-letter', {
                            letterId: this.currentLetter.id,
                            recipientEmail: email
                        });

                        if (response.data.success) {
                            alert('Письмо отправлено');
                            this.loadLetters();
                            this.loadStatistics();
                            this.closeModal();
                        } else {
                            throw new Error(response.data.error);
                        }
                    } catch (error) {
                        console.error('Error sending letter:', error);
                        alert('Ошибка отправки письма');
                    }
                }
            }

            // Инициализация
            const managerPanel = new ManagerPanel();
        </script>
    </body>
    </html>
  `)
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Система управления заявками на изменение проектной документации</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    </head>
    <body class="bg-gray-100">
        <nav class="bg-blue-800 text-white p-4">
            <div class="max-w-6xl mx-auto flex justify-between items-center">
                <h1 class="text-xl font-bold">
                    <i class="fas fa-file-edit mr-2"></i>
                    Управление заявками
                </h1>
                <div class="flex space-x-4">
                    <a href="/admin" class="hover:text-blue-200">
                        <i class="fas fa-cogs mr-1"></i>Админ панель
                    </a>
                    <a href="/manager" class="hover:text-blue-200">
                        <i class="fas fa-user-tie mr-1"></i>Согласование
                    </a>
                </div>
            </div>
        </nav>

        <div class="max-w-6xl mx-auto p-6">
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-2xl font-bold mb-4">Добро пожаловать в систему управления заявками</h2>
                <p class="text-gray-600 mb-6">
                    Система для обработки заявок на изменение проектной документации с интеграцией 
                    Telegram Bot API и автоматическим анализом через Google Gemini 2.5 Pro.
                </p>

                <div class="grid md:grid-cols-3 gap-6">
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <div class="flex items-center mb-3">
                            <i class="fas fa-robot text-blue-600 text-2xl mr-3"></i>
                            <h3 class="text-lg font-semibold">Telegram Bot</h3>
                        </div>
                        <p class="text-sm text-gray-600">
                            Прием заявок через Telegram с поддержкой голосовых сообщений и автоматической классификацией.
                        </p>
                    </div>

                    <div class="bg-green-50 p-4 rounded-lg">
                        <div class="flex items-center mb-3">
                            <i class="fas fa-brain text-green-600 text-2xl mr-3"></i>
                            <h3 class="text-lg font-semibold">AI Анализ</h3>
                        </div>
                        <p class="text-sm text-gray-600">
                            Автоматическая классификация заявок по категориям, срочности и типу изменений с помощью Gemini 2.5 Pro.
                        </p>
                    </div>

                    <div class="bg-orange-50 p-4 rounded-lg">
                        <div class="flex items-center mb-3">
                            <i class="fas fa-envelope text-orange-600 text-2xl mr-3"></i>
                            <h3 class="text-lg font-semibold">Email Рассылка</h3>
                        </div>
                        <p class="text-sm text-gray-600">
                            Автоматическое формирование и отправка структурированных писем заказчику после согласования.
                        </p>
                    </div>
                </div>

                <div class="mt-8 text-center">
                    <a href="/admin" class="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 mr-4">
                        <i class="fas fa-cogs mr-2"></i>Административная панель
                    </a>
                    <a href="/manager" class="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700">
                        <i class="fas fa-signature mr-2"></i>Страница согласования
                    </a>
                </div>
            </div>

            <div class="mt-6 bg-white rounded-lg shadow-lg p-6">
                <h3 class="text-lg font-bold mb-4">API Endpoints</h3>
                <div class="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                        <h4 class="font-semibold mb-2">Заявки</h4>
                        <ul class="space-y-1 text-gray-600">
                            <li><code>GET /api/requests</code> - Список заявок</li>
                            <li><code>POST /api/requests</code> - Создать заявку</li>
                            <li><code>PUT /api/requests/:id</code> - Обновить заявку</li>
                        </ul>
                    </div>
                    <div>
                        <h4 class="font-semibold mb-2">Telegram & AI</h4>
                        <ul class="space-y-1 text-gray-600">
                            <li><code>POST /api/telegram/webhook</code> - Webhook для бота</li>
                            <li><code>POST /api/gemini/analyze</code> - Анализ текста</li>
                            <li><code>POST /api/gemini/combine</code> - Объединение заявок</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `)
})

export default app
