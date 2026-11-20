import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Copy,
  Check,
  Save,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  CheckCircle2 as CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Play,
  Sparkles,
  FileText,
  Lock,
  Globe,
  HelpCircle,
} from 'lucide-react';
import { LeafButton } from '../ui/LeafButton';
import { BubbleElement } from '../ui/BubbleElement';
import { BubbleCurrencyIcon } from '../BubbleIcon';
import { formatIikr } from '../../lib/currency';

interface RobokassaConfig {
  id: string;
  merchant_login: string;
  password_1: string;
  password_2: string;
  test_password_1: string;
  test_password_2: string;
  hash_algorithm: string;
  is_test_mode: number;
  site_domain: string;
  result_url: string;
  result_method: string;
  success_url: string;
  success_method: string;
  fail_url: string;
  fail_method: string;
  payment_gateway_url: string;
  receipt_enabled: number;
  tax_system: string;
  vat_rate: string;
  is_active: number;
  updated_at?: string;
}

const DEFAULT_CONFIG: RobokassaConfig = {
  id: 'default',
  merchant_login: 'qaiz',
  password_1: 'qaizPass1_2026',
  password_2: 'qaizPass2_2026',
  test_password_1: 'qaizTestPass1_2026',
  test_password_2: 'qaizTestPass2_2026',
  hash_algorithm: 'MD5',
  is_test_mode: 0,
  site_domain: 'https://qaiz.ru',
  result_url: 'https://qaiz.ru/api/payments/robokassa/result',
  result_method: 'POST',
  success_url: 'https://qaiz.ru/api/payments/robokassa/success',
  success_method: 'GET',
  fail_url: 'https://qaiz.ru/api/payments/robokassa/fail',
  fail_method: 'GET',
  payment_gateway_url: 'https://auth.robokassa.ru/Merchant/Index.aspx',
  receipt_enabled: 1,
  tax_system: 'osn',
  vat_rate: 'vat5',
  is_active: 1,
};

export const RobokassaAdminManager: React.FC<{ adminUid?: string }> = ({ adminUid }) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<RobokassaConfig>(DEFAULT_CONFIG);
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedOrders: 0,
    totalRub: 0,
    totalIikr: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showPass1, setShowPass1] = useState<boolean>(true);
  const [showPass2, setShowPass2] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fetchConfigAndOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payments/robokassa/config', {
        headers: adminUid ? { 'x-user-uid': adminUid, 'x-admin-uid': adminUid } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.config) setConfig(data.config);
        if (Array.isArray(data.orders)) setOrders(data.orders);
        if (data.stats) setStats(data.stats);
      }
    } catch (err: any) {
      console.error('Error loading Robokassa config:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigAndOrders();
  }, []);

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/payments/robokassa/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(adminUid ? { 'x-user-uid': adminUid, 'x-admin-uid': adminUid } : {}),
        },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Ошибка сохранения настроек');
      }
      if (data.config) setConfig(data.config);
      setFeedback({
        type: 'success',
        text: data.message || 'Настройки Робокассы успешно сохранены в базе данных PostgreSQL!',
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Не удалось сохранить настройки' });
    } finally {
      setSaving(false);
    }
  };

  const handleSimulatePayment = async () => {
    setSimulating(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/payments/robokassa/test-simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminUid ? { 'x-user-uid': adminUid, 'x-admin-uid': adminUid } : {}),
        },
        body: JSON.stringify({
          userId: adminUid || '10016926299',
          iikrAmount: 100,
          outSum: 99.0,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Ошибка тестирования шлюза');
      }
      setFeedback({
        type: 'success',
        text: data.message || 'Тестовый платеж успешно проведен!',
      });
      await fetchConfigAndOrders();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Ошибка тестовой транзакции' });
    } finally {
      setSimulating(false);
    }
  };

  const fullInstructionText = `Подключение Робокассы к кнопкам оплаты (${config.site_domain})

1. Генерация ссылки оплаты (/api/payments/robokassa/initiate):
- При нажатии на любой пакет или кнопку «Оплатить» в магазине (${config.site_domain}/profile/exchange) на сервер отправляются параметры заказа (userId, payPrice, baseEnergy / baseIikr).
- Сервер формирует уникальный номер заказа InvId в таблице robokassa_orders, генерирует фискальный чек Receipt по 54-ФЗ с номенклатурой из договора оферты ("Внутриигровая валюта ИИкра", с указанием количества, цены за единицу cost, суммы sum, ставки НДС vat5 и системы налогообложения osn), рассчитывает хэш-подпись ${config.hash_algorithm} по формуле MerchantLogin:OutSum:InvId:Receipt:Password#1:Shp_energy=...:Shp_userId=... и передает ссылку со сгенерированным чеком.
- Пользователь автоматически перенаправляется на защищенный платежный шлюз Робокассы (${config.payment_gateway_url}).
- Для автосписаний (Recurring) используется аналогичный параметр Receipt и порядок подписи.

2. Обработчик уведомлений от Робокассы (/api/payments/robokassa/result):
- Робокасса отправляет серверный callback при успешной оплате на Result URL.
- Сервер сверяет ${config.hash_algorithm}-подпись с Паролем #2. При успешной проверке пользователю автоматически зачисляется ИИкра в базе данных PostgreSQL (таблица transactions с пересчетом баланса), статус заказа в robokassa_orders меняется на completed, отправляется уведомление в Telegram, а серверу Робокассы возвращается ответ OK<InvId>.

3. Страницы успеха и отмены (/api/payments/robokassa/success и /api/payments/robokassa/fail):
- Возвращают пользователя на ${config.site_domain}/payment/success (или ${config.site_domain}/?payment=success) с отображением золотого уведомления о зачислении ИИкры и квитанции заказа, либо на страницу ${config.site_domain}/payment/fail при отмене оплаты.

4. Номенклатура в чеке (54-ФЗ и оферта):
- Наименование позиции: "Внутриигровая валюта ИИкра" (дословно из оферты)
- Структура Receipt: {"sno":"osn","items":[{"name":"Внутриигровая валюта ИИкра","quantity":КОЛ-ВО,"cost":ЦЕНА,"sum":СУММА,"tax":"vat5","payment_method":"full_payment","payment_object":"service"}]}
- Ставка НДС: 5% (vat5) по общей системе налогообложения (ОСН)
- Подпись: MerchantLogin:OutSum:InvId:Receipt:Пароль1:Shp_energy=...:Shp_userId=... (в подпись идет чистый JSON, в URL — закодированный один раз; код ошибки 29 исключен).
- Способ и предмет расчета: полный расчет (full_payment), услуга (service).

📋 Технические данные для личного кабинета Робокассы (Technical Settings)
Заполните эти данные в личном кабинете Робокассы (https://merchant.robokassa.ru) в разделе «Настройки магазина» (${config.site_domain}):

• Идентификатор магазина (Merchant Login): ${config.merchant_login}
• Пароль #1 (Password 1): ${config.password_1} (используется для генерации ссылки на оплату и проверки Success URL)
• Пароль #2 (Password 2): ${config.password_2} (используется для проверки ответа сервера на Result URL)
• Result URL: ${config.result_url}
  Метод передачи данных в Result URL: ${config.result_method} (поддерживаются POST и GET)
• Success URL: ${config.success_url}
  Метод передачи данных в Success URL: ${config.success_method}
• Fail URL: ${config.fail_url}
  Метод передачи данных в Fail URL: ${config.fail_method}
• Алгоритм расчета хэша (Signature Hash): ${config.hash_algorithm}

🔗 Ссылки на страницы сайта для модерации магазина в Робокассе:
• Основной сайт: ${config.site_domain}
• Страница магазина и тарифов: ${config.site_domain}/profile/exchange
• Страница подтверждения оплаты: ${config.site_domain}/payment/success
• Главная с золотым уведомлением: ${config.site_domain}/?payment=success
• Страница ошибки / отмены оплаты: ${config.site_domain}/payment/fail
• Правила оплаты, зачисления и возврата: ${config.site_domain}/payment/info
• Публичная оферта: ${config.site_domain}/oferta`;

  const technicalFields = [
    {
      key: 'merchant_login',
      label: 'Идентификатор магазина (Merchant Login)',
      value: config.merchant_login,
      hint: 'Логин вашего магазина в Робокассе',
    },
    {
      key: 'password_1',
      label: 'Пароль #1 (Password 1)',
      value: config.password_1,
      hint: 'Используется для генерации ссылки на оплату',
    },
    {
      key: 'password_2',
      label: 'Пароль #2 (Password 2)',
      value: config.password_2,
      hint: 'Используется для проверки ответа сервера (Result URL)',
    },
    {
      key: 'result_url',
      label: 'Result URL (обработчик начисления ИИкры)',
      value: config.result_url,
      badge: `Метод: ${config.result_method}`,
      hint: 'Принимает callback от Робокассы и возвращает OK<InvId>',
    },
    {
      key: 'success_url',
      label: 'Success URL (переход после успешной оплаты)',
      value: config.success_url,
      badge: `Метод: ${config.success_method}`,
      hint: 'Открывает страницу успеха и золотое уведомление о зачислении',
    },
    {
      key: 'fail_url',
      label: 'Fail URL (переход при отказе или отмене оплаты)',
      value: config.fail_url,
      badge: `Метод: ${config.fail_method}`,
      hint: 'Открывает страницу отмены оплаты с возможностью повтора',
    },
    {
      key: 'hash_algorithm',
      label: 'Алгоритм расчета хэша (Signature Hash)',
      value: config.hash_algorithm,
      hint: 'Стандарт расчета контрольной суммы подписи',
    },
  ];

  const requiredModerationPages = [
    {
      title: 'Страница подтверждения успешной оплаты',
      path: '/payment/success?payment=success&invId=1024&outSum=297.00&iikr=300',
      publicUrl: `${config.site_domain}/payment/success`,
      desc: 'Золотое уведомление о зачислении ИИкры, квитанция заказа и переход к играм',
    },
    {
      title: 'Главная страница с золотым уведомлением',
      path: '/?payment=success&invId=1024&outSum=297.00&iikr=300',
      publicUrl: `${config.site_domain}/?payment=success`,
      desc: 'Всплывающее золотое окно при возврате пользователя на главную страницу',
    },
    {
      title: 'Страница ошибки и отмены оплаты',
      path: '/payment/fail?payment=fail&invId=1024&outSum=297.00&iikr=300',
      publicUrl: `${config.site_domain}/payment/fail`,
      desc: 'Информирование об отмене операции и кнопка повторной оплаты',
    },
    {
      title: 'Сведения об оплате, доставке и возврате',
      path: '/payment/info',
      publicUrl: `${config.site_domain}/payment/info`,
      desc: 'Обязательная информационная страница для проверки модератором Робокассы',
    },
    {
      title: 'Публичная оферта и соглашение',
      path: '/oferta',
      publicUrl: `${config.site_domain}/oferta`,
      desc: 'Юридические условия приобретения внутренней игровой валюты ИИкры',
    },
    {
      title: 'Витрина магазина и калькулятор пополнения',
      path: '/profile/exchange',
      publicUrl: `${config.site_domain}/profile/exchange`,
      desc: 'Страница с пакетами ИИкры, шкалой скидок и кнопкой «Оплатить»',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Summary Stats */}
      <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl text-primary shrink-0">
              <CreditCard size={28} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                  Платежный шлюз Робокасса (Robokassa)
                </h2>
                <BubbleElement isBadge size="sm" className="!text-sm text-primary border-primary/40">
                  Магазин: {config.merchant_login}
                </BubbleElement>
                <BubbleElement
                  isBadge
                  size="sm"
                  className={`!text-sm ${
                    config.is_test_mode
                      ? 'text-amber-300 border-amber-400/40'
                      : 'text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  {config.is_test_mode ? 'Тестовый режим' : 'Боевой режим'}
                </BubbleElement>
              </div>
              <p className="text-sm text-foreground/70 mt-1">
                Управление техническими настройками в БД PostgreSQL, готовые данные для личного кабинета merchant.robokassa.ru и проверка страниц оплаты
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <LeafButton
              variant="glass"
              size="sm"
              onClick={handleSimulatePayment}
              disabled={simulating}
              icon={<Play size={16} />}
            >
              {simulating ? 'Проверка...' : 'Тестовое начисление (OK<InvId>)'}
            </LeafButton>
            <LeafButton
              variant="primary"
              size="sm"
              onClick={() => handleCopy('all_instruction', fullInstructionText)}
              icon={copiedKey === 'all_instruction' ? <Check size={16} /> : <Copy size={16} />}
            >
              {copiedKey === 'all_instruction' ? 'Инструкция скопирована!' : 'Скопировать всю инструкцию'}
            </LeafButton>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 space-y-1">
            <span className="text-sm text-foreground/70 block">Всего заказов в БД</span>
            <span className="text-xl font-bold font-mono text-foreground">{stats.totalOrders}</span>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 space-y-1">
            <span className="text-sm text-foreground/70 block">Успешно оплачено</span>
            <span className="text-xl font-bold font-mono text-emerald-400">{stats.completedOrders}</span>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 space-y-1">
            <span className="text-sm text-foreground/70 block">Сумма оплат (₽)</span>
            <span className="text-xl font-bold font-mono text-primary">{stats.totalRub.toFixed(2)} ₽</span>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 space-y-1">
            <span className="text-sm text-foreground/70 block">Начислено ИИкры</span>
            <span className="text-xl font-bold font-mono text-amber-300 flex items-center gap-1.5">
              +{formatIikr(stats.totalIikr)} <BubbleCurrencyIcon className="w-4 h-4 inline" />
            </span>
          </div>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-2xl border backdrop-blur-xl flex items-center gap-3 text-sm font-medium ${
              feedback.type === 'success'
                ? 'border-emerald-500/40 text-emerald-300'
                : 'border-rose-500/40 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* SECTION 1: Ready-to-copy Technical Settings Table for merchant.robokassa.ru */}
      <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ShieldCheck size={20} className="text-primary" />
              <span>Сведения для заполнения в личном кабинете Робокассы (Технические настройки)</span>
            </h3>
            <p className="text-sm text-foreground/70 mt-0.5">
              Откройте личный кабинет <strong>merchant.robokassa.ru → Мои магазины → {config.merchant_login} → Технические настройки</strong> и скопируйте эти значения:
            </p>
          </div>
          <a
            href="https://merchant.robokassa.ru"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex"
          >
            <BubbleElement size="sm" className="text-sm font-semibold text-primary flex items-center gap-1.5">
              <span>Открыть merchant.robokassa.ru</span>
              <ExternalLink size={14} />
            </BubbleElement>
          </a>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {technicalFields.map((field) => (
            <div
              key={field.key}
              className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{field.label}</span>
                  {field.badge && (
                    <BubbleElement isBadge size="sm" className="!text-sm text-primary border-primary/35 font-mono">
                      {field.badge}
                    </BubbleElement>
                  )}
                </div>
                <p className="text-sm text-foreground/60">{field.hint}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <code className="px-3.5 py-2 rounded-xl border border-primary/30 bg-transparent font-mono text-sm font-bold text-primary break-all">
                  {field.value}
                </code>
                <LeafButton
                  variant="glass"
                  size="sm"
                  onClick={() => handleCopy(field.key, field.value)}
                  icon={copiedKey === field.key ? <Check size={15} /> : <Copy size={15} />}
                >
                  {copiedKey === field.key ? 'Скопировано' : 'Копировать'}
                </LeafButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 2: Full Formatted Instruction Text for One-Click Copy */}
      <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText size={20} className="text-primary" />
              <span>Полный текст инструкции и технических данных для копирования</span>
            </h3>
            <p className="text-sm text-foreground/70 mt-0.5">
              Готовая памятка со всеми маршрутами API, алгоритмом проверки подписи и ссылками для магазина {config.merchant_login} ({config.site_domain})
            </p>
          </div>
          <LeafButton
            variant="primary"
            size="sm"
            onClick={() => handleCopy('full_block_copy', fullInstructionText)}
            icon={copiedKey === 'full_block_copy' ? <Check size={16} /> : <Copy size={16} />}
          >
            {copiedKey === 'full_block_copy' ? 'Весь текст скопирован!' : 'Скопировать полный текст'}
          </LeafButton>
        </div>

        <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-5 space-y-4 text-sm text-foreground/90 leading-relaxed">
          <div className="space-y-2">
            <h4 className="text-base font-bold text-primary">
              Подключение Робокассы к кнопкам оплаты ({config.site_domain})
            </h4>
            <div className="space-y-1.5">
              <p className="font-bold text-foreground">
                1. Генерация ссылки оплаты (<code className="font-mono text-primary">/api/payments/robokassa/initiate</code>):
              </p>
              <ul className="list-disc pl-5 space-y-1 text-foreground/80">
                <li>
                  При нажатии на любой пакет или кнопку «Оплатить» на сервер отправляются параметры заказа (<code className="font-mono">userId</code>, <code className="font-mono">payPrice</code>, <code className="font-mono">baseEnergy</code> / <code className="font-mono">baseIikr</code>).
                </li>
                <li>
                  Сервер формирует уникальный номер заказа <code className="font-mono">InvId</code> в таблице <code className="font-mono">robokassa_orders</code>, рассчитывает хэш-подпись <code className="font-mono">{config.hash_algorithm}</code> с использованием <strong>Пароля #1</strong> и передает пользовательские параметры <code className="font-mono">Shp_energy</code> и <code className="font-mono">Shp_userId</code>.
                </li>
                <li>
                  Пользователь автоматически перенаправляется на защищенный платежный шлюз Робокассы.
                </li>
              </ul>
            </div>

            <div className="space-y-1.5 pt-2">
              <p className="font-bold text-foreground">
                2. Обработчик уведомлений от Робокассы (<code className="font-mono text-primary">/api/payments/robokassa/result</code>):
              </p>
              <ul className="list-disc pl-5 space-y-1 text-foreground/80">
                <li>Робокасса отправляет серверный callback при успешной оплате.</li>
                <li>
                  Сервер сверяет <code className="font-mono">{config.hash_algorithm}</code>-подпись с <strong>Паролем #2</strong>. При успешной проверке пользователю автоматически зачисляется ИИкра в базе данных PostgreSQL, статус транзакции в <code className="font-mono">robokassa_orders</code> меняется на <code className="font-mono">completed</code>, а Робокассе возвращается ответ <code className="font-mono text-primary">OK&lt;InvId&gt;</code>.
                </li>
              </ul>
            </div>

            <div className="space-y-1.5 pt-2">
              <p className="font-bold text-foreground">
                3. Страницы успеха и отмены (<code className="font-mono text-primary">/api/payments/robokassa/success</code> и <code className="font-mono text-primary">/fail</code>):
              </p>
              <ul className="list-disc pl-5 space-y-1 text-foreground/80">
                <li>
                  Возвращают пользователя на <code className="font-mono">{config.site_domain}/payment/success</code> (а также поддерживают <code className="font-mono">{config.site_domain}/?payment=success</code>) с отображением золотого уведомления о зачислении ИИкры и квитанции заказа.
                </li>
              </ul>
            </div>
          </div>

          <div className="h-px bg-primary/20 my-3" />

          <div className="space-y-2">
            <h4 className="text-base font-bold text-primary">
              📋 Технические данные для личного кабинета Робокассы (Technical Settings)
            </h4>
            <p className="text-foreground/80">
              Заполните эти данные в личном кабинете Робокассы (<code className="font-mono">https://merchant.robokassa.ru</code>) в разделе <strong>Настройки магазина</strong> (<code className="font-mono">{config.site_domain}</code>):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-foreground/85">
              <li>
                <strong>Идентификатор магазина (Merchant Login):</strong> <code className="font-mono text-primary font-bold">{config.merchant_login}</code>
              </li>
              <li>
                <strong>Пароль #1 (Password 1):</strong> <code className="font-mono text-primary font-bold">{config.password_1}</code> (используется для генерации ссылки на оплату)
              </li>
              <li>
                <strong>Пароль #2 (Password 2):</strong> <code className="font-mono text-primary font-bold">{config.password_2}</code> (используется для проверки ответа сервера)
              </li>
              <li>
                <strong>Result URL:</strong> <code className="font-mono text-primary font-bold">{config.result_url}</code> — Метод передачи данных: <strong>{config.result_method}</strong> (или GET)
              </li>
              <li>
                <strong>Success URL:</strong> <code className="font-mono text-primary font-bold">{config.success_url}</code> — Метод передачи данных: <strong>{config.success_method}</strong>
              </li>
              <li>
                <strong>Fail URL:</strong> <code className="font-mono text-primary font-bold">{config.fail_url}</code> — Метод передачи данных: <strong>{config.fail_method}</strong>
              </li>
              <li>
                <strong>Алгоритм расчета хэша (Signature Hash):</strong> <code className="font-mono text-primary font-bold">{config.hash_algorithm}</code>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* SECTION 3: Prepared Pages for Robokassa Moderation & Preview */}
      <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Globe size={20} className="text-primary" />
            <span>Подготовленные страницы оплаты для проверки и модерации Робокассы</span>
          </h3>
          <p className="text-sm text-foreground/70 mt-0.5">
            Все страницы оформлены в стиле Apple Liquid Glass и готовы к проверке службой безопасности Робокассы:
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requiredModerationPages.map((pg, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-foreground">{pg.title}</h4>
                <p className="text-sm text-foreground/65">{pg.desc}</p>
                <p className="text-sm font-mono text-primary break-all pt-1">{pg.publicUrl}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={() => navigate(pg.path)}
                  icon={<ExternalLink size={15} />}
                >
                  Открыть страницу
                </LeafButton>
                <LeafButton
                  variant="glass"
                  size="sm"
                  onClick={() => handleCopy(`page_${idx}`, pg.publicUrl)}
                  icon={copiedKey === `page_${idx}` ? <Check size={15} /> : <Copy size={15} />}
                >
                  {copiedKey === `page_${idx}` ? 'Скопировано' : 'Скопировать URL'}
                </LeafButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: Database Configuration Editor (robokassa_config table in PostgreSQL) */}
      <form
        onSubmit={handleSaveConfig}
        className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-primary/15 pb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Lock size={20} className="text-primary" />
              <span>Редактирование параметров в базе данных PostgreSQL (таблица robokassa_config)</span>
            </h3>
            <p className="text-sm text-foreground/70 mt-0.5">
              Пароли хранятся в БД в зашифрованном виде (AES-256-GCM) на сервере ProTalk PostgreSQL
            </p>
          </div>

          <LeafButton
            type="submit"
            variant="primary"
            size="md"
            disabled={saving}
            icon={<Save size={18} />}
          >
            {saving ? 'Сохранение...' : 'Сохранить настройки в БД'}
          </LeafButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">
              Идентификатор магазина (Merchant Login)
            </label>
            <input
              type="text"
              value={config.merchant_login}
              onChange={(e) => setConfig({ ...config, merchant_login: e.target.value })}
              className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 text-sm font-mono font-bold text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">
              Основной домен сайта (Site Domain)
            </label>
            <input
              type="text"
              value={config.site_domain}
              onChange={(e) => {
                const dom = e.target.value.replace(/\/+$/, '');
                setConfig({
                  ...config,
                  site_domain: dom,
                  result_url: `${dom}/api/payments/robokassa/result`,
                  success_url: `${dom}/api/payments/robokassa/success`,
                  fail_url: `${dom}/api/payments/robokassa/fail`,
                });
              }}
              className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 text-sm font-mono font-bold text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">
              Пароль #1 (Password 1 — генерация ссылки оплаты)
            </label>
            <div className="relative">
              <input
                type={showPass1 ? 'text' : 'password'}
                value={config.password_1}
                onChange={(e) => setConfig({ ...config, password_1: e.target.value })}
                className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 pr-12 text-sm font-mono font-bold text-primary focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPass1(!showPass1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-primary"
              >
                {showPass1 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">
              Пароль #2 (Password 2 — проверка Result URL)
            </label>
            <div className="relative">
              <input
                type={showPass2 ? 'text' : 'password'}
                value={config.password_2}
                onChange={(e) => setConfig({ ...config, password_2: e.target.value })}
                className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 pr-12 text-sm font-mono font-bold text-primary focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => setShowPass2(!showPass2)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-primary"
              >
                {showPass2 ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">Result URL</label>
            <input
              type="text"
              value={config.result_url}
              onChange={(e) => setConfig({ ...config, result_url: e.target.value })}
              className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">Success URL</label>
            <input
              type="text"
              value={config.success_url}
              onChange={(e) => setConfig({ ...config, success_url: e.target.value })}
              className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">Fail URL</label>
            <input
              type="text"
              value={config.fail_url}
              onChange={(e) => setConfig({ ...config, fail_url: e.target.value })}
              className="w-full rounded-2xl border border-primary/25 bg-transparent px-4 py-2.5 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">
              Алгоритм расчета хэша и режим работы
            </label>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {['MD5', 'SHA256', 'SHA512'].map((algo) => (
                <BubbleElement
                  key={algo}
                  type="button"
                  size="sm"
                  active={config.hash_algorithm === algo}
                  onClick={() => setConfig({ ...config, hash_algorithm: algo })}
                  className="!text-sm font-mono font-bold"
                >
                  {algo}
                </BubbleElement>
              ))}
              <BubbleElement
                type="button"
                size="sm"
                active={Boolean(config.is_test_mode)}
                onClick={() => setConfig({ ...config, is_test_mode: config.is_test_mode ? 0 : 1 })}
                className="!text-sm font-bold"
              >
                {config.is_test_mode ? 'Режим: Тестовый' : 'Режим: Боевой'}
              </BubbleElement>
            </div>
          </div>

          {/* Fiscalization & Receipt Settings per 54-FZ */}
          <div className="md:col-span-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-bold text-sm">
                <CheckCircle2 size={16} />
                <span>Фискализация и номенклатура чека (54-ФЗ и договор оферты)</span>
              </div>
              <BubbleElement
                type="button"
                size="sm"
                active={Boolean(config.receipt_enabled)}
                onClick={() => setConfig({ ...config, receipt_enabled: config.receipt_enabled ? 0 : 1 })}
                className="!text-xs font-bold"
              >
                {config.receipt_enabled ? 'Чек 54-ФЗ: включен' : 'Чек 54-ФЗ: выключен'}
              </BubbleElement>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/80">Система налогообложения (СНО)</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'osn', label: 'ОСН (общая)' },
                    { id: 'usn_income', label: 'УСН доходы' },
                    { id: 'usn_income_outcome', label: 'УСН доходы-расходы' },
                  ].map((s) => (
                    <BubbleElement
                      key={s.id}
                      type="button"
                      size="sm"
                      active={config.tax_system === s.id}
                      onClick={() => setConfig({ ...config, tax_system: s.id })}
                      className="!text-xs"
                    >
                      {s.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground/80">Ставка НДС (VAT)</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'vat5', label: 'НДС 5% (vat5)' },
                    { id: 'vat7', label: 'НДС 7% (vat7)' },
                    { id: 'vat20', label: 'НДС 20% (vat20)' },
                    { id: 'none', label: 'Без НДС' },
                  ].map((v) => (
                    <BubbleElement
                      key={v.id}
                      type="button"
                      size="sm"
                      active={config.vat_rate === v.id}
                      onClick={() => setConfig({ ...config, vat_rate: v.id })}
                      className="!text-xs font-mono font-bold"
                    >
                      {v.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>
            </div>

            <p className="text-xs text-foreground/80 leading-relaxed">
              В каждый платёж автоматически добавляется фискальный параметр <code className="font-mono text-primary">Receipt</code> с номенклатурой из договора оферты:
            </p>
            <div className="p-3 rounded-xl border border-primary/20 bg-transparent font-mono text-xs text-primary/90 break-all select-all">
              {`{"sno":"${config.tax_system || 'osn'}","items":[{"name":"Внутриигровая валюта ИИкра","quantity":100,"cost":0.99,"sum":99.00,"tax":"${config.vat_rate || 'vat5'}","payment_method":"full_payment","payment_object":"service"}]}`}
            </div>
            <p className="text-xs text-foreground/70 leading-relaxed">
              Наименование позиции передается дословно из оферты. Количество соответствует количеству приобретаемой ИИкры (или пакета), ставка НДС 5% (vat5) по системе налогообложения ОСН. Параметр Receipt включен в подпись <span className="font-mono text-primary font-semibold">MerchantLogin:OutSum:InvId:Receipt:Пароль1:Shp_...</span> в виде чистого JSON, а в платёжную ссылку передается закодированным один раз (URL-encoded), что полностью исключает ошибку 29 и отказ чека.
            </p>
          </div>
        </div>
      </form>

      {/* SECTION 5: Recent Robokassa Orders in PostgreSQL */}
      <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">
              Журнал платежных заказов Робокассы (таблица robokassa_orders)
            </h3>
            <p className="text-sm text-foreground/70">
              Последние заказы, сформированные через /api/payments/robokassa/initiate
            </p>
          </div>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={fetchConfigAndOrders}
            icon={<RefreshCw size={15} className={loading ? 'animate-spin' : ''} />}
          >
            Обновить
          </BubbleElement>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-primary/15 bg-transparent p-8 text-center text-sm text-foreground/60">
            Заказов пока нет. Нажмите «Тестовое начисление» выше или кнопку «Оплатить» в магазине ИИкры для создания первого заказа.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-primary/20 text-foreground/70">
                  <th className="py-3 px-3 font-bold">InvId</th>
                  <th className="py-3 px-3 font-bold">ID игрока</th>
                  <th className="py-3 px-3 font-bold">Сумма (₽)</th>
                  <th className="py-3 px-3 font-bold">ИИкра</th>
                  <th className="py-3 px-3 font-bold">Статус</th>
                  <th className="py-3 px-3 font-bold">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/10">
                {orders.map((ord) => (
                  <tr key={ord.inv_id} className="hover:bg-primary/5">
                    <td className="py-3 px-3 font-mono font-bold text-primary">№{ord.inv_id}</td>
                    <td className="py-3 px-3 font-mono text-foreground">{ord.user_id}</td>
                    <td className="py-3 px-3 font-mono font-bold text-foreground">
                      {Number(ord.out_sum || 0).toFixed(2)} ₽
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-amber-300">
                      +{ord.iikr_amount}
                    </td>
                    <td className="py-3 px-3">
                      <BubbleElement
                        isBadge
                        size="sm"
                        className={`!text-sm ${
                          ord.status === 'completed'
                            ? 'text-emerald-400 border-emerald-500/40'
                            : ord.status === 'failed'
                            ? 'text-rose-400 border-rose-500/40'
                            : 'text-amber-300 border-amber-400/40'
                        }`}
                      >
                        {ord.status === 'completed'
                          ? 'Оплачен (completed)'
                          : ord.status === 'failed'
                          ? 'Отменен (failed)'
                          : 'Ожидает (pending)'}
                      </BubbleElement>
                    </td>
                    <td className="py-3 px-3 font-mono text-foreground/70">{ord.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
