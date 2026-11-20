import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  CreditCard,
  ArrowRight,
  RefreshCcw,
  Home,
  Wallet,
  FileText,
  Clock,
  Sparkles,
  AlertCircle,
  ExternalLink,
  HelpCircle,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BubbleCurrencyIcon } from '../components/BubbleIcon';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { formatIikr, getIikrWord } from '../lib/currency';
import { audioSystem } from '../hooks/useSound';

interface OrderDetails {
  inv_id: number;
  order_uid: string;
  user_id: string;
  out_sum: number;
  iikr_amount: number;
  discount_percent: number;
  description: string;
  status: string;
  tx_id?: string;
  created_at: string;
  completed_at?: string;
}

export const PaymentResultPage: React.FC<{ mode?: 'success' | 'fail' | 'info' }> = ({ mode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, effectiveUid, refetchProfile } = useAuth();

  const searchParams = new URLSearchParams(location.search);
  const pathLower = location.pathname.toLowerCase();

  const resolvedMode: 'success' | 'fail' | 'info' = (() => {
    if (mode) return mode;
    if (pathLower.includes('/fail') || searchParams.get('payment') === 'fail') return 'fail';
    if (pathLower.includes('/info') || pathLower.includes('/rules')) return 'info';
    return 'success';
  })();

  const invIdParam = searchParams.get('invId') || searchParams.get('InvId') || '';
  const outSumParam = searchParams.get('outSum') || searchParams.get('OutSum') || '';
  const iikrParam = searchParams.get('iikr') || searchParams.get('Shp_energy') || '';
  const userIdParam = searchParams.get('userId') || searchParams.get('Shp_userId') || '';

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loadingOrder, setLoadingOrder] = useState<boolean>(Boolean(invIdParam));

  useEffect(() => {
    if (resolvedMode === 'success') {
      audioSystem.playSlot('ui_iikr_receive');
      if (refetchProfile) {
        refetchProfile();
      }
    } else if (resolvedMode === 'fail') {
      audioSystem.playSlot('ui_error_alert');
      const targetUser = userIdParam || profile?.uid || effectiveUid || '';
      if (invIdParam || (targetUser && !String(targetUser).startsWith('demo_'))) {
        fetch('/api/payments/robokassa/report-fail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invId: invIdParam || undefined,
            userId: targetUser || undefined,
            iikr: iikrParam || undefined,
            outSum: outSumParam || undefined,
            domain: window.location.origin,
          }),
        }).catch(() => {});
      }
    }
  }, [resolvedMode, invIdParam, userIdParam, profile?.uid, effectiveUid]);

  useEffect(() => {
    if (!invIdParam) {
      setLoadingOrder(false);
      return;
    }
    setLoadingOrder(true);
    fetch(`/api/payments/robokassa/order/${encodeURIComponent(invIdParam)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.order) {
          setOrder(data.order);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingOrder(false));
  }, [invIdParam]);

  const displayInvId = order?.inv_id || invIdParam || '—';
  const displayOutSum = order?.out_sum !== undefined
    ? Number(order.out_sum).toFixed(2)
    : outSumParam
    ? Number(outSumParam).toFixed(2)
    : '';
  const displayIikr = order?.iikr_amount || (iikrParam ? Number(iikrParam) : 0);

  if (resolvedMode === 'info') {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4 space-y-6 pb-16">
        {/* Header Card */}
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-14 w-14 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl flex items-center justify-center text-primary shrink-0">
                <ShieldCheck size={28} />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                  Условия оплаты, зачисления ИИкры и безопасность платежей
                </h1>
                <p className="text-sm text-foreground/70 mt-1">
                  Официальная информация для пользователей платформы Квайз (qaiz.ru) при оплате через Робокассу
                </p>
              </div>
            </div>
            <BubbleElement
              onClick={() => navigate('/profile/exchange')}
              size="sm"
              className="text-sm font-bold text-primary cursor-pointer"
            >
              Перейти в магазин ИИкры
            </BubbleElement>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-primary font-bold text-base">
              <CreditCard size={20} />
              <span>1. Способы оплаты и платежный шлюз</span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Оплата пакетов внутренней игровой валюты (ИИкры) на сайте <strong>qaiz.ru</strong> производится через сертифицированный платежный сервис <strong>Робокасса (Robokassa)</strong>.
            </p>
            <p className="text-sm text-foreground/75 leading-relaxed">
              К оплате принимаются банковские карты Российской Федерации (МИР, Visa, Mastercard), а также быстрые платежи через защищенную форму Робокассы. Базовый курс составляет <strong>1 ИИкра = 0.99 рубля</strong> с учетом накопительной шкалы скидок до 25%.
            </p>
          </div>

          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-primary font-bold text-base">
              <Sparkles size={20} />
              <span>2. Мгновенное зачисление ИИкры</span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Зачисление приобретенного пакета ИИкры на баланс пользователя происходит <strong>автоматически и мгновенно</strong> сразу после подтверждения оплаты сервером Робокассы (обработчик Result URL).
            </p>
            <p className="text-sm text-foreground/75 leading-relaxed">
              После оплаты пользователь перенаправляется обратно на сайт <strong>qaiz.ru</strong>, где отображается золотое уведомление о зачислении и квитанция в разделе «Транзакции».
            </p>
          </div>

          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-primary font-bold text-base">
              <Lock size={20} />
              <span>3. Безопасность передачи данных</span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Ввод реквизитов банковской карты осуществляется исключительно на защищенной платежной странице сервиса Робокасса по протоколу шифрования TLS и стандарту безопасности <strong>PCI DSS</strong>.
            </p>
            <p className="text-sm text-foreground/75 leading-relaxed">
              Платформа Квайз не получает, не обрабатывает и не хранит данные банковских карт пользователей. Проверка подлинности каждого заказа защищена криптографической подписью.
            </p>
          </div>

          <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-primary font-bold text-base">
              <RefreshCcw size={20} />
              <span>4. Порядок возврата средств и поддержка</span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              В случае технического сбоя или ошибочного списания средств вы можете обратиться в службу поддержки Квайз с указанием вашего ID игрока и номера заказа (InvId).
            </p>
            <p className="text-sm text-foreground/75 leading-relaxed">
              Возврат неиспользованного платного баланса осуществляется на ту же банковскую карту, с которой производилась оплата, в соответствии с условиями Публичной оферты.
            </p>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate('/profile/exchange')}
              icon={<Wallet size={18} />}
            >
              Открыть магазин пополнения
            </LeafButton>
            <LeafButton
              variant="glass"
              size="md"
              onClick={() => navigate('/oferta')}
              icon={<FileText size={18} />}
            >
              Публичная оферта
            </LeafButton>
          </div>
          <BubbleElement
            onClick={() => navigate('/')}
            size="sm"
            className="text-sm font-semibold cursor-pointer"
          >
            На главную страницу
          </BubbleElement>
        </div>
      </div>
    );
  }

  if (resolvedMode === 'fail') {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6 pb-16">
        <div className="rounded-3xl border border-rose-500/35 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-6 text-center relative overflow-hidden">
          <div className="mx-auto w-20 h-20 rounded-3xl border border-rose-500/40 bg-transparent backdrop-blur-xl flex items-center justify-center text-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
            <XCircle size={42} />
          </div>

          <div className="space-y-2">
            <div className="flex justify-center">
              <BubbleElement isBadge size="sm" className="!text-sm border-rose-500/40 text-rose-400">
                Оплата не завершена
              </BubbleElement>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              Платеж через Робокассу был отменен или отклонен
            </h1>
            <p className="text-sm text-foreground/75 max-w-lg mx-auto leading-relaxed">
              Средства с вашей карты не были списаны, либо банк отклонил проведение операции. Вы можете повторить попытку оплаты в любой момент.
            </p>
          </div>

          {/* Order info if available */}
          {(displayInvId !== '—' || displayOutSum || displayIikr > 0) && (
            <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 text-left space-y-2.5 max-w-md mx-auto">
              <div className="text-sm font-bold text-foreground border-b border-primary/15 pb-2 flex items-center justify-between">
                <span>Сведения о заказе</span>
                <BubbleElement isBadge size="sm" className="!text-sm border-rose-500/30 text-rose-400">
                  Отменен
                </BubbleElement>
              </div>
              {displayInvId !== '—' && (
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/70">Номер заказа (InvId):</span>
                  <span className="font-mono font-bold text-foreground">№{displayInvId}</span>
                </div>
              )}
              {displayIikr > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/70">Пакет пополнения:</span>
                  <span className="font-mono font-bold text-primary flex items-center gap-1">
                    {formatIikr(displayIikr)} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                  </span>
                </div>
              )}
              {displayOutSum && (
                <div className="flex justify-between text-sm">
                  <span className="text-foreground/70">Сумма заказа:</span>
                  <span className="font-mono font-bold text-foreground">{displayOutSum} ₽</span>
                </div>
              )}
            </div>
          )}

          {/* Possible Reasons */}
          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 text-left space-y-2">
            <p className="text-sm font-bold text-foreground flex items-center gap-2">
              <HelpCircle size={18} className="text-primary shrink-0" />
              <span>Возможные причины отмены оплаты:</span>
            </p>
            <ul className="text-sm text-foreground/75 space-y-1.5 pl-6 list-disc">
              <li>Вы нажали кнопку «Вернуться в магазин» или закрыли окно оплаты Робокассы.</li>
              <li>Истекло время ожидания подтверждения кода 3D-Secure от банка.</li>
              <li>Недостаточно средств на карте или установлен лимит на интернет-покупки.</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate('/profile/exchange')}
              icon={<RefreshCcw size={18} />}
              className="w-full sm:w-auto justify-center"
            >
              Попробовать оплатить снова
            </LeafButton>
            <LeafButton
              variant="glass"
              size="md"
              onClick={() => navigate('/')}
              icon={<Home size={18} />}
              className="w-full sm:w-auto justify-center"
            >
              Вернуться на главную
            </LeafButton>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
            <BubbleElement
              onClick={() => navigate('/payment/info')}
              size="sm"
              className="text-sm text-foreground/70 cursor-pointer"
            >
              Правила оплаты и безопасности
            </BubbleElement>
            <BubbleElement
              onClick={() => navigate('/oferta')}
              size="sm"
              className="text-sm text-foreground/70 cursor-pointer"
            >
              Публичная оферта
            </BubbleElement>
          </div>
        </div>
      </div>
    );
  }

  // SUCCESS MODE
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6 pb-16">
      <div className="rounded-3xl border border-amber-400/45 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-6 text-center shadow-[0_0_45px_rgba(251,191,36,0.18)] relative overflow-hidden">
        {/* Golden Glow Icon */}
        <div className="mx-auto w-20 h-20 rounded-3xl border border-amber-400/50 bg-transparent backdrop-blur-xl flex items-center justify-center text-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.3)]">
          <CheckCircle2 size={44} />
        </div>

        <div className="space-y-2">
          <div className="flex justify-center">
            <BubbleElement isBadge size="sm" className="!text-sm border-amber-400/50 text-amber-300 font-bold">
              Золотое уведомление • Оплата подтверждена
            </BubbleElement>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Баланс ИИкры успешно пополнен!
          </h1>
          <p className="text-sm text-foreground/80 max-w-lg mx-auto leading-relaxed">
            Спасибо за оплату через Робокассу. Ваша ИИкра уже зачислена на аккаунт в базе данных и готова к использованию во всех играх и викторинах Квайз.
          </p>
        </div>

        {/* Receipt Card */}
        <div className="rounded-2xl border border-amber-400/35 bg-transparent backdrop-blur-xl p-5 text-left space-y-3 max-w-md mx-auto">
          <div className="flex items-center justify-between border-b border-primary/15 pb-2.5">
            <span className="text-sm font-bold text-foreground flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <span>Квитанция платежа Робокассы</span>
            </span>
            <BubbleElement isBadge size="sm" className="!text-sm border-emerald-500/40 text-emerald-400">
              Исполнен
            </BubbleElement>
          </div>

          {displayInvId !== '—' && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground/70">Номер заказа (InvId):</span>
              <span className="font-mono font-bold text-foreground">№{displayInvId}</span>
            </div>
          )}

          {displayIikr > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground/70">Зачислено на баланс:</span>
              <span className="font-mono font-bold text-amber-300 text-base flex items-center gap-1.5">
                +{formatIikr(displayIikr)} <BubbleCurrencyIcon className="w-4 h-4 inline" />
              </span>
            </div>
          )}

          {displayOutSum && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground/70">Оплаченная сумма:</span>
              <span className="font-mono font-bold text-foreground">{displayOutSum} ₽</span>
            </div>
          )}

          <div className="flex justify-between items-center text-sm pt-2 border-t border-primary/15">
            <span className="text-foreground/70">Ваш текущий баланс:</span>
            <span className="font-mono font-bold text-primary text-base flex items-center gap-1.5">
              {formatIikr(profile?.balance ?? 0)} <BubbleCurrencyIcon className="w-4 h-4 inline" />
            </span>
          </div>

          {(profile?.uid || effectiveUid) && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground/70">ID получателя:</span>
              <span className="font-mono text-foreground/80">{profile?.uid || effectiveUid}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <LeafButton
            variant="primary"
            size="md"
            onClick={() => navigate('/')}
            icon={<ArrowRight size={18} />}
            className="w-full sm:w-auto justify-center"
          >
            Перейти к викторинам
          </LeafButton>
          <LeafButton
            variant="glass"
            size="md"
            onClick={() => navigate('/profile/trans')}
            icon={<Wallet size={18} />}
            className="w-full sm:w-auto justify-center"
          >
            История транзакций
          </LeafButton>
          <LeafButton
            variant="glass"
            size="md"
            onClick={() => navigate('/profile/exchange')}
            icon={<CreditCard size={18} />}
            className="w-full sm:w-auto justify-center"
          >
            В магазин
          </LeafButton>
        </div>
      </div>
    </div>
  );
};
