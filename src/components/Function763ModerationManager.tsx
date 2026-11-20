import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Settings2, 
  FileSpreadsheet, 
  Save, 
  RefreshCw, 
  Send, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Sliders, 
  Coins, 
  Trash2,
  ExternalLink,
  Sparkles,
  Info
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';

interface ModerationConfig {
  id?: number;
  function_id: number;
  functions_base_id: string;
  bot_id: number;
  bot_token: string;
  instruction: string;
  options: string;
  decision_type: string;
  debug: boolean | number;
  log_url: string | null;
  enable_sheets_logging: number;
  user_prefix: string;
  is_active: number;
  reject_threshold: number;
  updated_at?: string;
}

interface ModerationTestResult {
  allowed: boolean;
  reason?: string;
  decision?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
  tokens?: number;
  rub?: number;
  logId?: number;
}

const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1kIhukcOFzUv5BcISsmFIRxlnGRwjFTB0ZO2Au9t6wh4/edit?usp=sharing';

const DEFAULT_LEGAL_RU_MODERATION_PROMPT = `Ты — официальный ИИ-контролер и строгий модератор текстовых сообщений в защищенной сети ИИSMM.
Твоя задача — объективно, строго и беспристрастно проверить сообщение пользователя на соответствие законодательству Российской Федерации, нормам общественной безопасности и правилам цифровых сообществ.

Критерии нарушений (отказ / violation):
1. Законодательство РФ и общественная безопасность:
   - Призывы к терроризму, экстремизму, насилию, свержению конституционного строя.
   - Разжигание национальной, расовой, религиозной, социальной или иной вражды.
   - Пропаганда, продажа или распространение наркотических средств, психотропных веществ, оружия, взрывчатки.
   - Заведомо ложная общественно значимая информация (фейки), клевета, прямые угрозы жизни или здоровью людей, шантаж и вымогательство.
   - Порнографический контент, материалы сексуального насилия или любая эксплуатация несовершеннолетних.
2. Мошенничество и вредоносная деятельность:
   - Фишинг, вредоносные ссылки, вредоносное ПО, вирусы, стилеры.
   - Реклама нелегальных онлайн-казино, азартных игр, финансовых пирамид, сомнительных схем быстрого обогащения и скама.
   - Массовый спам, агрессивная реклама сторонних каналов и навязчивая рассылка.
3. Этика и культура общения:
   - Нецензурная брань, грубый мат, унижение человеческого достоинства, травля (буллинг), токсичные оскорбления.

Важное правило по медиафайлам: прямые ссылки на изображения, картинки, медиа и файлы, отправляемые пользователями, сами по себе спамом не являются. Оценивай содержательный контекст и подписи (текст) к медиафайлам: нарушение фиксируется только если в тексте или подписи содержится спам, реклама, мошенничество, мат или нарушение законов РФ.

Правило принятия решения:
- Если сообщение нарушает хотя бы один пункт выше: выбери "Отказ" (no).
- Если сообщение чистое, безопасное, не содержит спама, мата, мошенничества и не нарушает законы РФ: выбери "Согласие" (yes).`;

export const Function763ModerationManager: React.FC<{
  onRefreshLogs?: () => void;
}> = ({ onRefreshLogs }) => {
  const [config, setConfig] = useState<ModerationConfig>({
    function_id: 763,
    functions_base_id: 'appkq3HrzrxYxoAV8',
    bot_id: 60381,
    bot_token: '',
    instruction: DEFAULT_LEGAL_RU_MODERATION_PROMPT,
    options: 'Отказ::no;;Согласие::yes',
    decision_type: 'choice',
    debug: 0,
    log_url: DEFAULT_SHEET_URL,
    enable_sheets_logging: 1,
    user_prefix: 'qaiz_chat_{id}',
    is_active: 1,
    reject_threshold: 0.5
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test state
  const [testText, setTestText] = useState('Привет всем! Кто готов сыграть в квиз сегодня вечером?');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ModerationTestResult | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/system/moderation/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(prev => ({
            ...prev,
            ...data.config,
            log_url: data.config.log_url || '',
            enable_sheets_logging: data.config.enable_sheets_logging !== undefined ? Number(data.config.enable_sheets_logging) : 1,
            is_active: data.config.is_active !== undefined ? Number(data.config.is_active) : 1
          }));
        }
      }
    } catch (e: any) {
      console.error('Error fetching moderation config:', e);
      setStatusMessage({ type: 'error', text: 'Ошибка загрузки настроек модерации' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload = {
        ...config,
        log_url: config.log_url?.trim() ? config.log_url.trim() : null
      };

      const res = await fetch('/api/admin/system/moderation/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          setConfig(prev => ({ ...prev, ...data.config }));
        }
        setStatusMessage({ type: 'success', text: 'Настройки модерации (функция 763) и таблица логирования зафиксированы в базе данных' });
        if (onRefreshLogs) onRefreshLogs();
      } else {
        const err = await res.json().catch(() => null);
        setStatusMessage({ type: 'error', text: err?.error || 'Ошибка при сохранении в базу данных' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Сетевая ошибка' });
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    if (!testText.trim()) return;
    setTesting(true);
    setTestResult(null);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/system/moderation/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: testText.trim(),
          instruction: config.instruction
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult(data.result);
        if (onRefreshLogs) onRefreshLogs();
      } else {
        const err = await res.json().catch(() => null);
        setStatusMessage({ type: 'error', text: err?.error || 'Ошибка при тестировании функции 763' });
      }
    } catch (e: any) {
      setStatusMessage({ type: 'error', text: e.message || 'Сетевая ошибка теста' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 sm:p-6 space-y-6 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-primary/15 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <BubbleElement size="sm" isBadge icon={<ShieldCheck size={18} />}>
              Функция 763
            </BubbleElement>
            <h3 className="text-lg sm:text-xl font-bold text-foreground">
              Прямая ИИ-модерация чатов
            </h3>
          </div>
          <p className="text-sm text-foreground/75 leading-relaxed">
            Прямой API-запрос к функции 763 без промежуточного бота. Логирование ответов, расхода токенов и стоимости в рублях в базу данных.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <BubbleElement
            size="sm"
            onClick={fetchConfig}
            disabled={loading}
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
          >
            Обновить
          </BubbleElement>

          <LeafButton
            size="sm"
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            icon={<Save size={16} />}
          >
            {saving ? 'Сохранение...' : 'Зафиксировать'}
          </LeafButton>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-2xl backdrop-blur-md border border-primary/40 text-foreground bg-transparent text-sm flex items-center gap-2.5">
          <BubbleElement size="sm" isBadge active={statusMessage.type === 'success'} icon={statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}>
            {statusMessage.type === 'success' ? 'Готово' : 'Внимание'}
          </BubbleElement>
          <span className="leading-relaxed">{statusMessage.text}</span>
        </div>
      )}

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Google Sheets & Core Params */}
        <div className="rounded-2xl border border-primary/20 p-4 space-y-4 bg-transparent backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-primary/10 pb-2">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <FileSpreadsheet size={18} />
              <span>Таблица для логирования (Google Sheets)</span>
            </div>
            <BubbleElement
              size="sm"
              active={Boolean(config.enable_sheets_logging)}
              onClick={() => setConfig(prev => ({ ...prev, enable_sheets_logging: prev.enable_sheets_logging ? 0 : 1 }))}
            >
              {config.enable_sheets_logging ? 'Включено' : 'Выключено'}
            </BubbleElement>
          </div>

          <p className="text-sm text-foreground/75 leading-relaxed">
            Вы можете добавлять или убирать ссылку на таблицу в базе данных. Если ссылка пустая или логирование отключено, параметр log_url не передается в функцию.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground/90 block">
              URL таблицы Google Sheets (log_url):
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={config.log_url || ''}
                onChange={e => setConfig(prev => ({ ...prev, log_url: e.target.value }))}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-primary/25 bg-transparent backdrop-blur-md text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                {config.log_url && (
                  <BubbleElement
                    size="sm"
                    title="Убрать таблицу из базы данных"
                    onClick={() => setConfig(prev => ({ ...prev, log_url: '' }))}
                    icon={<Trash2 size={15} />}
                  >
                    Убрать
                  </BubbleElement>
                )}
                <BubbleElement
                  size="sm"
                  title="Восстановить ссылку по умолчанию"
                  onClick={() => setConfig(prev => ({ ...prev, log_url: DEFAULT_SHEET_URL }))}
                >
                  По умолчанию
                </BubbleElement>
              </div>
            </div>

            {config.log_url && config.log_url.startsWith('http') && (
              <a
                href={config.log_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
              >
                <span>Открыть таблицу в новой вкладке</span>
                <ExternalLink size={13} />
              </a>
            )}
          </div>

          {/* User prefix & Function ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">ID функции:</label>
              <input
                type="number"
                value={config.function_id}
                onChange={e => setConfig(prev => ({ ...prev, function_id: Number(e.target.value) || 763 }))}
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">База функций:</label>
              <input
                type="text"
                value={config.functions_base_id}
                onChange={e => setConfig(prev => ({ ...prev, functions_base_id: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground/80">Префикс пользователя (user_prefix):</label>
              <input
                type="text"
                value={config.user_prefix}
                onChange={e => setConfig(prev => ({ ...prev, user_prefix: e.target.value }))}
                placeholder="qaiz_chat_{id}"
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
          </div>
        </div>

        {/* Right: Decision Instruction & Prompts */}
        <div className="rounded-2xl border border-primary/20 p-4 space-y-4 bg-transparent backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-primary/10 pb-2">
            <div className="flex items-center gap-2 text-primary font-bold text-sm">
              <Sliders size={18} />
              <span>Параметры принятия решения</span>
            </div>
            <BubbleElement
              size="sm"
              active={Boolean(config.is_active)}
              onClick={() => setConfig(prev => ({ ...prev, is_active: prev.is_active ? 0 : 1 }))}
            >
              {config.is_active ? 'Активна' : 'Приостановлена'}
            </BubbleElement>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground/90">
                Инструкция модерации (instruction):
              </label>
              <button
                type="button"
                onClick={() => setConfig(prev => ({
                  ...prev,
                  instruction: 'Модерирование чата от грубостей, спама или чата. Если надо удалить, то отказ, если оставить в чате, то согласие'
                }))}
                className="text-xs text-primary hover:underline"
              >
                Вернуть стандартную
              </button>
            </div>
            <textarea
              rows={3}
              value={config.instruction}
              onChange={e => setConfig(prev => ({ ...prev, instruction: e.target.value }))}
              className="w-full p-3 rounded-xl border border-primary/25 bg-transparent backdrop-blur-md text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Варианты (options):</label>
              <input
                type="text"
                value={config.options}
                onChange={e => setConfig(prev => ({ ...prev, options: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Тип решения:</label>
              <input
                type="text"
                value={config.decision_type}
                onChange={e => setConfig(prev => ({ ...prev, decision_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Бот ID:</label>
              <input
                type="number"
                value={config.bot_id}
                onChange={e => setConfig(prev => ({ ...prev, bot_id: Number(e.target.value) || 60381 }))}
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground/80">Порог отказа (0.0 - 1.0):</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                value={config.reject_threshold}
                onChange={e => setConfig(prev => ({ ...prev, reject_threshold: Number(e.target.value) || 0.5 }))}
                className="w-full px-3 py-2 rounded-xl border border-primary/20 bg-transparent text-sm text-foreground focus:outline-none focus:border-primary font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Testing Console */}
      <div className="rounded-2xl border border-primary/25 p-4 sm:p-5 space-y-4 bg-transparent backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-primary/15 pb-2">
          <div className="flex items-center gap-2 text-primary font-bold text-sm sm:text-base">
            <Sparkles size={18} />
            <span>Интерактивная проверка работы функции 763</span>
          </div>
          <span className="text-xs text-foreground/60 hidden sm:inline">
            Мгновенная оценка сообщения и расчет токенов/рублей
          </span>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-semibold text-foreground/90 block">
            Тестовый текст сообщения чата:
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={testText}
              onChange={e => setTestText(e.target.value)}
              placeholder="Введите сообщение для модерации..."
              className="flex-1 px-4 py-2.5 rounded-xl border border-primary/25 bg-transparent backdrop-blur-md text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary"
              onKeyDown={e => {
                if (e.key === 'Enter') handleRunTest();
              }}
            />
            <LeafButton
              size="sm"
              variant="primary"
              onClick={handleRunTest}
              disabled={testing || !testText.trim()}
              icon={<Send size={15} />}
            >
              {testing ? 'Проверка...' : 'Проверить'}
            </LeafButton>
          </div>

          {/* Quick preset chips */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-foreground/60">Примеры для быстрой проверки:</span>
            <BubbleElement
              size="sm"
              onClick={() => setTestText('Привет всем! Когда стартует следующий раунд викторины?')}
            >
              Дружелюбный вопрос
            </BubbleElement>
            <BubbleElement
              size="sm"
              onClick={() => setTestText('Переходи по ссылке заработок 500$ в день без вложений телеграм')}
            >
              Тест спама
            </BubbleElement>
            <BubbleElement
              size="sm"
              onClick={() => setTestText('Вы все придурки и идиоты, удалите игру')}
            >
              Тест грубости
            </BubbleElement>
          </div>

          {/* Result Card */}
          {testResult && (
            <div className="mt-4 rounded-2xl border border-primary/30 p-4 space-y-3 bg-transparent backdrop-blur-md animate-in fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-primary/15 pb-2">
                <div className="flex items-center gap-2">
                  {testResult.allowed ? (
                    <div className="flex items-center gap-2 text-primary font-bold text-base">
                      <CheckCircle2 size={20} />
                      <span>Сообщение допущено (Согласие)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-foreground font-bold text-base">
                      <AlertCircle size={20} className="text-primary" />
                      <span>Сообщение отклонено (Отказ)</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs sm:text-sm font-mono text-foreground/80">
                  <span className="flex items-center gap-1">
                    <Coins size={14} className="text-primary" />
                    <span>Токены: <strong className="text-primary">{testResult.tokens ?? 0}</strong></span>
                  </span>
                  <span>
                    Стоимость: <strong className="text-primary">{(testResult.rub ?? 0).toFixed(4)} руб.</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="p-2.5 rounded-xl border border-primary/15 bg-transparent">
                  <span className="text-xs text-foreground/50 block">Выбранное решение:</span>
                  <span className="font-bold text-foreground font-mono">{testResult.decision || (testResult.allowed ? 'Согласие' : 'Отказ')}</span>
                </div>
                <div className="p-2.5 rounded-xl border border-primary/15 bg-transparent">
                  <span className="text-xs text-foreground/50 block">Вероятности:</span>
                  <span className="text-xs font-mono text-foreground">
                    {testResult.probabilities ? JSON.stringify(testResult.probabilities) : 'нет данных'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl border border-primary/15 bg-transparent">
                  <span className="text-xs text-foreground/50 block">Запись в таблице logs:</span>
                  <span className="text-xs font-mono text-primary font-bold">
                    {testResult.logId ? `ID #${testResult.logId} сохранен` : 'Зафиксировано'}
                  </span>
                </div>
              </div>

              {testResult.reason && (
                <div className="p-2.5 rounded-xl border border-primary/30 text-foreground text-sm leading-relaxed">
                  Причина: {testResult.reason}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
