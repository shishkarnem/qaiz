import React, { useState, useEffect } from 'react';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';

interface EmailAuthFormProps {
  onSuccess?: (user: any) => void;
  defaultMode?: 'login' | 'register' | 'forgot';
  defaultReferralCode?: string;
  compact?: boolean;
  initialResetToken?: string | null;
}

export const EmailAuthForm: React.FC<EmailAuthFormProps> = ({
  onSuccess,
  defaultMode = 'login',
  defaultReferralCode = '',
  compact = false,
  initialResetToken = null,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(
    initialResetToken ? 'forgot' : defaultMode
  );
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>(
    initialResetToken ? 'verify' : 'request'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [activeResetToken, setActiveResetToken] = useState<string>(initialResetToken || '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    if (defaultReferralCode) return defaultReferralCode;
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const raw =
          params.get('startapp') ||
          params.get('tgWebAppStartParam') ||
          params.get('ref') ||
          params.get('start') ||
          (window as any).Telegram?.WebApp?.initDataUnsafe?.start_param ||
          localStorage.getItem('referral_uid') ||
          '';
        if (raw && !String(raw).startsWith('link_')) {
          const cleaned = String(raw)
            .replace(/^.*startapp=/i, '')
            .replace(/^.*ref=/i, '')
            .replace(/^ref_/i, '')
            .trim();
          if (/^\d{11}$/.test(cleaned)) {
            localStorage.setItem('referral_uid', cleaned);
            return cleaned;
          }
        }
      }
    } catch {}
    return '';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Check if URL or prop contains an encrypted password reset token
  useEffect(() => {
    const tokenFromUrl =
      initialResetToken ||
      (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('reset_token')
        : null);

    if (tokenFromUrl) {
      setActiveResetToken(tokenFromUrl);
      setMode('forgot');
      setForgotStep('verify');
      setLoading(true);
      fetch(`/api/auth/verify-reset-token?token=${encodeURIComponent(tokenFromUrl)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.valid) {
            if (data.email) setEmail(data.email);
            if (data.code) setResetCode(data.code);
            setInfoMessage(
              'Зашифрованная ссылка подтверждена! Введите новый пароль для вашего аккаунта.'
            );
          } else {
            setError(
              data.error ||
                'Ссылка восстановления устарела. Запросите новое письмо или введите 6-значный код.'
            );
          }
        })
        .catch(() => {
          setError('Не удалось проверить ссылку восстановления.');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [initialResetToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim().toLowerCase();

    if (mode === 'forgot') {
      if (forgotStep === 'request') {
        if (!trimmedEmail || !trimmedEmail.includes('@')) {
          setError('Пожалуйста, укажите корректный адрес электронной почты');
          return;
        }
        setLoading(true);
        try {
          const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: trimmedEmail }),
          });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'Не удалось отправить письмо восстановления');
          } else {
            setForgotStep('verify');
            setInfoMessage(
              data.message ||
                'Письмо с зашифрованной ссылкой и 6-значным кодом отправлено на вашу почту!'
            );
          }
        } catch {
          setError('Ошибка соединения с сервером при отправке письма');
        } finally {
          setLoading(false);
        }
        return;
      }

      // forgotStep === 'verify'
      if (!activeResetToken && (!resetCode || resetCode.trim().length < 6)) {
        setError('Введите 6-значный код безопасности из письма');
        return;
      }
      if (password.length < 6) {
        setError('Новый пароль должен содержать не менее 6 символов');
        return;
      }
      if (password !== confirmPassword) {
        setError('Введенные пароли не совпадают');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: trimmedEmail,
            code: resetCode.trim(),
            token: activeResetToken || undefined,
            newPassword: password,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Ошибка при сохранении нового пароля');
        } else {
          setInfoMessage(data.message || 'Пароль успешно изменен!');
          // Clean reset_token from URL if present
          if (typeof window !== 'undefined' && window.location.search.includes('reset_token')) {
            const url = new URL(window.location.href);
            url.searchParams.delete('reset_token');
            window.history.replaceState({}, '', url.toString());
          }
          const resolvedUser = data.user || data.data;
          if (resolvedUser) {
            try {
              localStorage.setItem('user_session', JSON.stringify(resolvedUser));
              localStorage.setItem('user_data', JSON.stringify(resolvedUser));
            } catch {}
            onSuccess?.(resolvedUser);
          } else {
            setMode('login');
            setForgotStep('request');
          }
        }
      } catch {
        setError('Ошибка соединения с сервером');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Укажите корректный адрес электронной почты');
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов');
      return;
    }

    if (mode === 'register') {
      if (!firstName.trim()) {
        setError('Укажите ваше имя');
        return;
      }
      if (password !== confirmPassword) {
        setError('Пароли не совпадают');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/email/register' : '/api/auth/email/login';
      const bodyPayload: Record<string, any> = {
        email: trimmedEmail,
        password,
      };

      if (mode === 'register') {
        bodyPayload.first_name = firstName.trim();
        bodyPayload.last_name = lastName.trim();
        bodyPayload.username = username.trim();
        const rawRefInput = (referralCode || localStorage.getItem('referral_uid') || '').trim();
        const cleanedRefInput = rawRefInput
          .replace(/^.*startapp=/i, '')
          .replace(/^.*ref=/i, '')
          .replace(/^ref_/i, '')
          .trim();
        bodyPayload.referral_code = cleanedRefInput;
        bodyPayload.referred_by = cleanedRefInput;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Ошибка авторизации');
        return;
      }

      const resolvedUser = data.user || data.data;
      if (resolvedUser) {
        try {
          localStorage.removeItem('tg_logged_out');
          sessionStorage.removeItem('tg_logged_out');
          localStorage.setItem('user_session', JSON.stringify(resolvedUser));
          localStorage.setItem('user_data', JSON.stringify(resolvedUser));
        } catch {}
        onSuccess?.(resolvedUser);
      }
    } catch {
      setError('Ошибка соединения с сервером. Проверьте подключение.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full text-left">
      {/* Переключатель Вход / Регистрация на пузырях */}
      <div className="flex flex-col sm:flex-row gap-2 p-1.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/25 mb-4">
        <BubbleElement
          size="md"
          active={mode === 'login'}
          onClick={() => {
            setMode('login');
            setError(null);
            setInfoMessage(null);
          }}
          className="w-full sm:flex-1 justify-center py-2 text-sm font-bold cursor-pointer"
        >
          Вход по почте
        </BubbleElement>
        <BubbleElement
          size="md"
          active={mode === 'register'}
          onClick={() => {
            setMode('register');
            setError(null);
            setInfoMessage(null);
          }}
          className="w-full sm:flex-1 justify-center py-2 text-sm font-bold cursor-pointer"
        >
          Регистрация
        </BubbleElement>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-red-500/40 flex items-start gap-2.5 text-red-300 text-sm">
          <AlertCircle size={18} className="shrink-0 mt-0.5 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {infoMessage && (
        <div className="mb-3 p-3 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/40 flex items-start gap-2.5 text-primary text-sm">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-primary" />
          <span>{infoMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'register' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                  Имя *
                </label>
                <div className="relative">
                  <User
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50"
                  />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Ваше имя"
                    className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                  Фамилия
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Фамилия"
                  className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>

            {!compact && (
              <div>
                <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                  Никнейм (необязательно)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Например: player_one"
                  className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            )}
          </>
        )}

        {/* Поле Email */}
        <div>
          <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
            Электронная почта *
          </label>
          <div className="relative">
            <Mail
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
              required={mode !== 'forgot' || forgotStep === 'request' || !activeResetToken}
            />
          </div>
        </div>

        {/* Режим восстановления пароля: шаг 2 (код + новый пароль) */}
        {mode === 'forgot' && forgotStep === 'verify' && (
          <div className="space-y-3 p-3.5 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <BubbleElement
                isBadge
                active
                size="sm"
                icon={<ShieldCheck size={15} className="text-black" />}
              >
                Восстановление пароля Квайз
              </BubbleElement>
              <BubbleElement
                size="sm"
                onClick={() => {
                  setForgotStep('request');
                  setError(null);
                  setInfoMessage(null);
                }}
                icon={<RefreshCw size={14} />}
                className="cursor-pointer text-sm"
              >
                Отправить код повторно
              </BubbleElement>
            </div>

            {!activeResetToken && (
              <div>
                <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                  6-значный код из письма *
                </label>
                <div className="relative">
                  <KeyRound
                    size={16}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-primary"
                  />
                  <input
                    type="text"
                    maxLength={6}
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Например: 482910"
                    className="w-full bg-transparent backdrop-blur-md border border-primary/35 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-bold tracking-widest text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                Новый пароль *
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                Повторите новый пароль *
              </label>
              <div className="relative">
                <KeyRound
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите новый пароль"
                  className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                  required
                />
              </div>
            </div>
          </div>
        )}

        {/* Поле Пароль для обычного входа или регистрации */}
        {mode !== 'forgot' && (
          <div>
            <div className="flex items-center justify-between mb-1 ml-1">
              <label className="block text-sm text-foreground/80 font-medium">
                Пароль *
              </label>
              {mode === 'login' && (
                <BubbleElement
                  size="sm"
                  onClick={() => {
                    setMode('forgot');
                    setForgotStep('request');
                    setError(null);
                    setInfoMessage(null);
                  }}
                  className="text-sm text-primary cursor-pointer py-0.5 px-2.5"
                >
                  Забыли пароль?
                </BubbleElement>
              )}
            </div>
            <div className="relative">
              <Lock
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl pl-9 pr-10 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/60 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        )}

        {mode === 'register' && (
          <>
            <div>
              <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                Подтвердите пароль *
              </label>
              <div className="relative">
                <KeyRound
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                  className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                  required
                />
              </div>
            </div>

            {!compact && (
              <div>
                <label className="block text-sm text-foreground/80 mb-1 ml-1 font-medium">
                  Реферальный код (если есть)
                </label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  placeholder="Код приглашения"
                  className="w-full bg-transparent backdrop-blur-md border border-primary/25 rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-colors"
                />
              </div>
            )}
          </>
        )}

        <div className="pt-2 space-y-2.5">
          <LeafButton
            type="submit"
            variant="primary"
            size="md"
            disabled={loading}
            className="w-full justify-center py-3 text-sm font-bold"
            icon={<ArrowRight size={16} />}
          >
            {loading
              ? 'Подождите...'
              : mode === 'register'
              ? 'Зарегистрироваться и получить 100 ИИР'
              : mode === 'forgot'
              ? forgotStep === 'request'
                ? 'Отправить письмо восстановления'
                : 'Сохранить новый пароль и войти'
              : 'Войти в аккаунт'}
          </LeafButton>

          {mode === 'forgot' && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
              {forgotStep === 'request' && (
                <BubbleElement
                  size="sm"
                  onClick={() => {
                    setForgotStep('verify');
                    setError(null);
                  }}
                  className="w-full sm:w-auto justify-center text-sm cursor-pointer"
                >
                  У меня уже есть код из письма
                </BubbleElement>
              )}
              <BubbleElement
                size="sm"
                onClick={() => {
                  setMode('login');
                  setForgotStep('request');
                  setError(null);
                  setInfoMessage(null);
                }}
                className="w-full sm:w-auto justify-center text-sm cursor-pointer"
              >
                Вернуться ко входу
              </BubbleElement>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
