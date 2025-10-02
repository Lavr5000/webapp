// TypeScript типы для приложения

export interface CloudflareBindings {
  DB: D1Database;
  GOOGLE_GENERATIVE_AI_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  EMAIL_API_KEY: string;
  EMAIL_FROM: string;
  TELEGRAM_WEBHOOK_URL: string;
}

export interface Request {
  id: number;
  telegram_user_id: string;
  telegram_username?: string;
  user_name: string;
  message_text: string;
  audio_file_url?: string;
  transcribed_text?: string;
  category?: string;
  urgency_level: number;
  change_type?: string;
  doc_section?: string;
  status: 'новая' | 'на_рассмотрении' | 'одобрена' | 'отклонена' | 'в_работе' | 'завершена';
  is_approved: boolean;
  admin_comment?: string;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  telegram_user_id: string;
  telegram_username?: string;
  name: string;
  role: 'user' | 'admin' | 'manager';
  is_active: boolean;
  created_at: string;
}

export interface Letter {
  id: number;
  title: string;
  content: string;
  request_ids: string; // JSON массив
  status: 'черновик' | 'на_согласовании' | 'подписан' | 'отправлен';
  manager_comment?: string;
  signed_at?: string;
  sent_at?: string;
  recipient_email?: string;
  created_by: number;
  created_at: string;
}

export interface EmailLog {
  id: number;
  letter_id?: number;
  recipient_email: string;
  subject: string;
  status: 'отправлено' | 'ошибка' | 'в_очереди';
  error_message?: string;
  sent_at: string;
}

export interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  date: number;
  text?: string;
  voice?: {
    duration: number;
    mime_type: string;
    file_id: string;
    file_unique_id: string;
    file_size: number;
  };
}

export interface GeminiAnalysis {
  category: string;
  urgency_level: number;
  change_type: string;
  doc_section: string;
  summary: string;
}