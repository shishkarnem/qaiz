import React, { useState, useEffect } from 'react';
import { 
  Globe, Check, HelpCircle, Save, Database, 
  Copy, CheckCheck, Loader2, KeyRound, UserCheck, ShieldCheck, 
  FileText, Clock, ExternalLink, Sparkles
} from 'lucide-react';
import { LeafButton } from '../ui/LeafButton';
import { BubbleElement } from '../ui/BubbleElement';

export const SystemAdminProxySection: React.FC = () => {
  const [proxyType, setProxyType] = useState<'dialog_ai' | 'custom_cloudflare' | 'direct'>('dialog_ai');
  const [customProxyUrl, setCustomProxyUrl] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('@qaiz_aibot');
  const [maskedToken, setMaskedToken] = useState('');
  const [isTokenConfigured, setIsTokenConfigured] = useState(false);
  const [adminId, setAdminId] = useState('169262990');
  const [showCfHelp, setShowCfHelp] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingBackup, setIsTestingBackup] = useState(false);
  const [backupResult, setBackupResult] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const getAdminHeaders = (): Record<string, string> => {
    const uid =
      localStorage.getItem('qaiz_active_user_id') ||
      localStorage.getItem('user_id') ||
      '10016926299';
    return {
      'Content-Type': 'application/json',
      'x-user-uid': uid,
      'x-admin-uid': uid
    };
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = () => {
    fetch('/api/admin/bot-settings', { headers: getAdminHeaders() })
      .then((res) => res.json())
      .then((data) => {
        if (data.proxyType) setProxyType(data.proxyType);
        if (data.proxyType === 'custom_cloudflare') {
          setCustomProxyUrl(data.apiBaseUrl || '');
        }
        if (data.botUsername) setBotUsername(data.botUsername);
        setMaskedToken(data.maskedToken || '');
        setIsTokenConfigured(data.isTokenConfigured || false);
        if (data.adminTelegramId) setAdminId(data.adminTelegramId);
      })
      .catch(console.error);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/bot-settings', {
        method: 'POST',
        headers: getAdminHeaders(),
        body: JSON.stringify({
          proxyType,
          apiBaseUrl: customProxyUrl,
          botToken: botToken || undefined,
          botUsername: botUsername || undefined,
          adminTelegramId: adminId
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: 'Конфигурация проксирования и Telegram-бота успешно сохранена' });
        setBotToken('');
        if (data.config?.isTokenConfigured) setIsTokenConfigured(true);
        if (data.config?.maskedToken) setMaskedToken(data.config.maskedToken);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка при сохранении конфигурации' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: `Ошибка сохранения: ${e.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerBackup = async () => {
    setIsTestingBackup(true);
    setBackupResult(null);
    try {
      const res = await fetch('/api/admin/backup/trigger', {
        method: 'POST',
        headers: getAdminHeaders()
      });
      const data = await res.json();
      setBackupResult(data);
      if (data.success) {
        setStatusMsg({
          type: 'success',
          text: `Резервная копия (${data.filename}) успешно отправлена в личные сообщения админу ${adminId}! Записей: ${data.totalRows.toLocaleString('ru-RU')}, таблиц: ${data.tablesCount}`
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: `Не удалось отправить бэкап: ${data.error || 'Проверьте токен бота и ID админа'}`
        });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: `Ошибка запуска бэкапа: ${e.message}` });
    } finally {
      setIsTestingBackup(false);
    }
  };

  const getFullExampleUrl = () => {
    const tokenDisplay = isTokenConfigured ? '<токен_бота>' : '<ваш_токен>';
    if (proxyType === 'dialog_ai') {
      return `https://eu1.account.dialog.ai.atiks.org/bot${tokenDisplay}/sendMessage`;
    }
    if (proxyType === 'custom_cloudflare') {
      const base = customProxyUrl.replace(/\/+$/, '') || 'https://your-worker.your-subdomain.workers.dev';
      return `${base}/bot${tokenDisplay}/sendMessage`;
    }
    return `https://api.telegram.org/bot${tokenDisplay}/sendMessage`;
  };

  const workerJsCode = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'api.telegram.org';
    const newReq = new Request(url, request);
    return fetch(newReq);
  }
};`;

  const copyWorkerCode = () => {
    navigator.clipboard.writeText(workerJsCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Main Glass Card */}
      <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)]">
        
        {/* Header with Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-primary/15 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/25 text-primary">
              <Globe size={26} />
            </div>
            <div>
              <h2 className="text-xl font-black text-foreground">
                Шлюз и проксирование Telegram Bot Api
              </h2>
              <p className="text-sm font-medium text-foreground/70">
                Безопасное хранение токенов, антиблокировочные шлюзы и автобэкап в 06:00 мск
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <BubbleElement size="sm" isBadge icon={<Clock size={15} />}>
              Автобэкап: 06:00 мск
            </BubbleElement>
            <BubbleElement
              size="sm"
              onClick={() => setShowCfHelp(!showCfHelp)}
              icon={<HelpCircle size={15} />}
            >
              {showCfHelp ? 'Скрыть инструкцию' : 'Инструкция по Cloudflare'}
            </BubbleElement>
          </div>
        </div>

        {/* Cloudflare Worker Step-by-Step Guide */}
        {showCfHelp && (
          <div className="rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-5 space-y-4 text-sm text-foreground/90">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="font-bold text-base text-primary flex items-center gap-2">
                <Sparkles size={18} />
                <span>Инструкция: создание собственного Cloudflare Worker прокси</span>
              </div>
              <BubbleElement size="sm" onClick={copyWorkerCode} icon={copiedCode ? <CheckCheck size={14} /> : <Copy size={14} />}>
                {copiedCode ? 'Код скопирован' : 'Скопировать код'}
              </BubbleElement>
            </div>

            <ol className="list-decimal list-inside space-y-2 text-sm text-foreground/85 leading-relaxed">
              <li>
                Зарегистрируйтесь или войдите в личный кабинет на{' '}
                <a
                  href="https://dash.cloudflare.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline font-semibold hover:opacity-80 inline-flex items-center gap-1"
                >
                  dash.cloudflare.com <ExternalLink size={14} />
                </a>
              </li>
              <li>
                В левом меню выберите <b>Build → Compute → Workers & Pages → Create Application</b>. Выберите готовый шаблон <b>"Hello, World"</b>, задайте имя воркера и нажмите <b>Deploy</b>.
              </li>
              <li>
                На странице созданного воркера нажмите кнопку <b>"Edit Code"</b> (в правом верхнем углу) и замените весь исходный код на следующий скрипт:
              </li>
            </ol>

            <div className="relative">
              <pre className="bg-transparent backdrop-blur-md p-4 rounded-xl border border-primary/20 font-mono text-sm text-primary overflow-x-auto">
                {workerJsCode}
              </pre>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed">
              После вставки нажмите <b>Deploy</b> и скопируйте адрес вашего воркера (например, <code className="text-primary font-mono font-bold">https://my-proxy.my-subdomain.workers.dev</code>) в поле ниже при выборе пресета «Свой Cloudflare Worker».
            </p>
          </div>
        )}

        {/* 3 Proxy Presets Grid */}
        <div className="space-y-3">
          <label className="text-sm font-bold text-foreground flex items-center gap-2">
            <Globe size={16} className="text-primary" />
            <span>Выберите режим проксирования Telegram Api:</span>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Preset 1: Dialog AI Gateway */}
            <div
              onClick={() => setProxyType('dialog_ai')}
              className={`cursor-pointer p-5 rounded-2xl border bg-transparent backdrop-blur-xl transition-all flex flex-col justify-between gap-3 ${
                proxyType === 'dialog_ai'
                  ? 'border-primary/60 shadow-[0_0_20px_rgba(131,196,46,0.25)]'
                  : 'border-primary/20 hover:border-primary/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-base text-foreground">Готовый прокси-шлюз</span>
                  {proxyType === 'dialog_ai' && (
                    <BubbleElement size="sm" isBadge active icon={<Check size={14} />}>
                      Активно
                    </BubbleElement>
                  )}
                </div>
                <p className="text-sm text-foreground/70">
                  Выделенный надежный европейский шлюз с нулевой вероятностью блокировок
                </p>
              </div>
              <code className="text-sm font-mono text-primary/90 bg-transparent backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-primary/20 break-all">
                https://eu1.account.dialog.ai.atiks.org
              </code>
            </div>

            {/* Preset 2: Custom Cloudflare Worker */}
            <div
              onClick={() => setProxyType('custom_cloudflare')}
              className={`cursor-pointer p-5 rounded-2xl border bg-transparent backdrop-blur-xl transition-all flex flex-col justify-between gap-3 ${
                proxyType === 'custom_cloudflare'
                  ? 'border-primary/60 shadow-[0_0_20px_rgba(131,196,46,0.25)]'
                  : 'border-primary/20 hover:border-primary/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-base text-foreground">Свой Cloudflare Worker</span>
                  {proxyType === 'custom_cloudflare' && (
                    <BubbleElement size="sm" isBadge active icon={<Check size={14} />}>
                      Активно
                    </BubbleElement>
                  )}
                </div>
                <p className="text-sm text-foreground/70">
                  Ваш персональный бесплатный прокси-сервер на инфраструктуре Cloudflare
                </p>
              </div>
              <span className="text-sm font-mono text-primary/90 bg-transparent backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-primary/20">
                Пользовательский адрес
              </span>
            </div>

            {/* Preset 3: Direct */}
            <div
              onClick={() => setProxyType('direct')}
              className={`cursor-pointer p-5 rounded-2xl border bg-transparent backdrop-blur-xl transition-all flex flex-col justify-between gap-3 ${
                proxyType === 'direct'
                  ? 'border-primary/60 shadow-[0_0_20px_rgba(131,196,46,0.25)]'
                  : 'border-primary/20 hover:border-primary/40'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-base text-foreground">Прямое подключение</span>
                  {proxyType === 'direct' && (
                    <BubbleElement size="sm" isBadge active icon={<Check size={14} />}>
                      Активно
                    </BubbleElement>
                  )}
                </div>
                <p className="text-sm text-foreground/70">
                  Стандартное обращение к официальным серверам Telegram Api напрямую
                </p>
              </div>
              <code className="text-sm font-mono text-foreground/70 bg-transparent backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-primary/20 break-all">
                https://api.telegram.org
              </code>
            </div>
          </div>
        </div>

        {/* Custom Cloudflare Input Field */}
        {proxyType === 'custom_cloudflare' && (
          <div className="space-y-2 p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20">
            <label className="text-sm font-bold text-foreground">
              Адрес вашего Cloudflare Worker:
            </label>
            <input
              type="text"
              value={customProxyUrl}
              onChange={(e) => setCustomProxyUrl(e.target.value)}
              placeholder="https://aihim.shishkarnem.workers.dev"
              className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary font-mono"
            />
          </div>
        )}

        {/* Endpoint Preview Box */}
        <div className="p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20 space-y-1.5">
          <span className="text-sm font-bold text-foreground/70 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-primary" />
            <span>Итоговый адрес выполнения запросов и отправки бэкапов:</span>
          </span>
          <div className="font-mono text-sm text-primary break-all select-all font-semibold">
            {getFullExampleUrl()}
          </div>
        </div>

        {/* Credentials & Admin Settings Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Bot Token Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <KeyRound size={15} className="text-primary" />
                <span>Токен Telegram-бота:</span>
              </label>
              {isTokenConfigured && (
                <BubbleElement size="sm" isBadge>
                  {maskedToken}
                </BubbleElement>
              )}
            </div>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder={isTokenConfigured ? 'Оставьте пустым, чтобы сохранить текущий рабочий токен' : 'Введите новый токен бота при смене'}
              className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-sm text-foreground/60">
              Токен хранится в защищенной базе PostgreSQL и никогда не передается в открытом виде в браузер.
            </p>
          </div>

          {/* Admin Telegram ID Input */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <UserCheck size={15} className="text-primary" />
              <span>Telegram идентификатор администратора (получатель автобэкапа):</span>
            </label>
            <input
              type="text"
              value={adminId}
              onChange={(e) => setAdminId(e.target.value)}
              placeholder="169262990"
              className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary font-mono"
            />
            <p className="text-sm text-foreground/60">
              На этот идентификатор каждый день ровно в 06:00 по мск бот присылает файл резервной копии.
            </p>
          </div>
        </div>

        {/* Status Toast Alert */}
        {statusMsg && (
          <div className={`p-4 rounded-2xl border bg-transparent backdrop-blur-xl text-sm transition-all ${
            statusMsg.type === 'success'
              ? 'border-primary/40 text-primary font-medium'
              : 'border-rose-500/40 text-rose-300 font-medium'
          }`}>
            {statusMsg.text}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-primary/15">
          <LeafButton
            variant="primary"
            onClick={handleSave}
            disabled={isSaving}
            icon={isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          >
            {isSaving ? 'Сохранение настроек...' : 'Сохранить конфигурацию'}
          </LeafButton>

          <LeafButton
            variant="glass"
            onClick={handleTriggerBackup}
            disabled={isTestingBackup}
            icon={isTestingBackup ? <Loader2 className="animate-spin text-primary" size={16} /> : <Database size={16} />}
          >
            {isTestingBackup ? 'Создание и отправка бэкапа...' : 'Тестовый запуск бэкапа в Telegram'}
          </LeafButton>
        </div>

      </div>

      {/* Auto Backup Info Card */}
      <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-6 space-y-3">
        <div className="flex items-center gap-3 text-primary">
          <Clock size={22} />
          <h3 className="text-base font-bold text-foreground">
            Регламент автоматического резервного копирования
          </h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-foreground/80">
          <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-md border border-primary/20 space-y-1">
            <span className="text-sm text-foreground/60 font-semibold block">Расписание (Cron)</span>
            <span className="font-bold text-foreground">Ежедневно в 06:00 мск</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-md border border-primary/20 space-y-1">
            <span className="text-sm text-foreground/60 font-semibold block">Формат слепка</span>
            <span className="font-bold text-foreground">Структурированный Json</span>
          </div>
          <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-md border border-primary/20 space-y-1">
            <span className="text-sm text-foreground/60 font-semibold block">Получатель в Telegram</span>
            <span className="font-bold text-primary font-mono">{adminId || '169262990'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
