import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Trophy, 
  Gamepad2, 
  Wallet, 
  Send, 
  Mail, 
  Copy, 
  Check, 
  ExternalLink, 
  ArrowLeft, 
  ShieldCheck, 
  Sparkles, 
  Calendar,
  User as UserIcon,
  Loader2,
  Share2,
  UserPlus,
  UserMinus,
  MessageSquare,
  Pencil
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';
import { BubbleCurrencyIcon } from '../components/BubbleIcon';
import { formatIikr, getIikrWord } from '../lib/currency';
import { useAuth } from '../context/AuthContext';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { DirectChatModal } from '../components/DirectChatModal';
import { friendsService } from '../services/friends';

interface PublicUserData {
  uid: string;
  id: string;
  display_name: string;
  role: string;
  username: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  telegram_photo: string | null;
  telegram_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  balance: number;
  balance_pay: number;
  balance_free: number;
  games_played: number;
  games_won: number;
  total_score: number;
  last_seen?: string | null;
  is_online?: number | boolean;
  created_at?: string;
}

export function PublicProfilePage() {
  const params = useParams<{ uid?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { profile: myProfile, openAuthModal } = useAuth();

  const isDemoOrUnregistered = !myProfile || !myProfile.uid;

  // Extract UID either from route param or location pathname (e.g. /profile10016926299 or /profile/10016926299)
  const resolvedUid = (() => {
    if (params.uid) {
      return params.uid.replace(/^profile/i, '');
    }
    const match = location.pathname.match(/\/profile\/?([0-9a-zA-Z_-]+)/i);
    return match ? match[1] : '';
  })();

  const [userData, setUserData] = useState<PublicUserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [friendLoading, setFriendLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const checkFriendStatus = async (targetUid: string) => {
    if (!myProfile?.uid || !targetUid || myProfile.uid === targetUid) return;
    try {
      const res = await friendsService.fetchUsers({
        userId: myProfile.uid,
        filter: 'friends',
        search: targetUid,
        limit: 1
      });
      const match = res.data.find(u => u.uid === targetUid);
      setIsFriend(Boolean(match?.is_friend));
    } catch (_) {}
  };

  useEffect(() => {
    if (!resolvedUid) {
      setError('Идентификатор пользователя не указан');
      setLoading(false);
      return;
    }

    try {
      if (/^\d{11}$/.test(resolvedUid)) {
        localStorage.setItem('referral_uid', resolvedUid);
        sessionStorage.setItem('pending_ref', resolvedUid);
      }
    } catch (_) {}

    const fetchPublicProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/users/public/${resolvedUid}`);
        if (!res.ok) {
          throw new Error('Пользователь не найден или профиль недоступен');
        }
        const json = await res.json();
        if (json.data) {
          setUserData(json.data);
          checkFriendStatus(json.data.uid);
        } else {
          throw new Error('Не удалось загрузить данные профиля');
        }
      } catch (err: any) {
        setError(err.message || 'Ошибка загрузки профиля');
      } finally {
        setLoading(false);
      }
    };

    fetchPublicProfile();
  }, [resolvedUid, myProfile?.uid]);

  const handleToggleFriend = async () => {
    if (isDemoOrUnregistered) {
      openAuthModal('login');
      return;
    }
    if (!userData || friendLoading || !myProfile?.uid) return;
    setFriendLoading(true);
    try {
      if (isFriend) {
        await friendsService.removeFriend(myProfile.uid, userData.uid);
        setIsFriend(false);
      } else {
        await friendsService.addFriend(myProfile.uid, userData.uid);
        setIsFriend(true);
      }
    } catch (e) {
      console.error('Error toggling friend:', e);
    } finally {
      setFriendLoading(false);
    }
  };

  const copyToClipboard = (text: string, setter: (v: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'superadmin':
        return { label: 'Супер-администратор', color: 'bg-primary/20 text-primary border-primary/40' };
      case 'admin':
        return { label: 'Администратор', color: 'bg-primary/15 text-primary border-primary/30' };
      case 'author':
        return { label: 'Автор игр', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' };
      default:
        return { label: 'Игрок', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' };
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-primary" size={44} />
        <p className="text-sm font-semibold text-foreground/70">Загрузка публичного профиля...</p>
      </div>
    );
  }

  if (error || !userData) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-6">
        <div className="p-6 rounded-[2rem] border border-primary/20 bg-card/20 backdrop-blur-2xl shadow-xl space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/15 text-destructive mx-auto flex items-center justify-center border border-destructive/30">
            <UserIcon size={32} />
          </div>
          <h2 className="text-xl font-bold text-foreground">Профиль не найден</h2>
          <p className="text-sm text-foreground/60">
            {error || 'Пользователь с указанным UID не существует или был удален.'}
          </p>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl border border-primary/20 bg-background/30 text-sm font-bold text-foreground/80 hover:text-foreground hover:bg-background/50 transition-all flex items-center gap-2"
            >
              <ArrowLeft size={16} />
              Назад
            </button>
            <Link
              to="/rating"
              className="btn-primary px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 shadow-md"
            >
              <Trophy size={16} />
              В рейтинг игроков
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const roleInfo = getRoleBadge(userData.role);
  const cleanUsername = userData.username ? userData.username.replace(/^@/, '') : '';
  const tgLink = cleanUsername ? `https://t.me/${cleanUsername}` : userData.telegram_id ? `https://t.me/${userData.telegram_id}` : null;
  const isOwnProfile = myProfile && (myProfile.uid === userData.uid || myProfile.id === userData.uid);
  const profileUrl = `${window.location.origin}/profile${userData.uid}`;

  return (
    <div className="space-y-6 w-full max-w-none pb-16 text-sm overflow-x-hidden min-w-0">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 w-full min-w-0">
        <BubbleElement
          size="md"
          onClick={() => navigate('/rating')}
          icon={<ArrowLeft size={18} />}
          className="px-3.5 py-2 text-sm font-bold shrink-0"
        >
          <span>К рейтингу</span>
        </BubbleElement>

        <div className="flex items-center gap-2 shrink-0">
          <BubbleElement
            size="md"
            active={copiedLink}
            onClick={() => copyToClipboard(profileUrl, setCopiedLink)}
            icon={copiedLink ? <Check size={18} /> : <Share2 size={18} />}
            className="px-3 sm:px-4 py-2 text-sm font-bold"
            title={copiedLink ? 'Ссылка скопирована' : 'Скопировать ссылку на профиль'}
          >
            <span className="hidden sm:inline">{copiedLink ? 'Ссылка скопирована' : 'Поделиться'}</span>
          </BubbleElement>

          {isOwnProfile && (
            <BubbleElement
              size="md"
              active={true}
              onClick={() => navigate('/profile')}
              icon={<Pencil size={18} />}
              className="px-3 sm:px-4 py-2 text-sm font-bold"
              title="Редактировать профиль"
            >
              <span className="hidden sm:inline">Редактировать</span>
            </BubbleElement>
          )}
        </div>
      </div>

      {/* Main Public Profile Card with Apple Liquid Glass */}
      <div className="relative overflow-hidden rounded-[2.5rem] border border-primary/25 bg-transparent backdrop-blur-2xl p-5 sm:p-10 shadow-[0_12px_40px_rgba(0,0,0,0.4)] min-w-0">
        {/* Glow ambient background element */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/15 blur-[100px] rounded-full -translate-y-1/3 translate-x-1/3 pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-start gap-8">
          {/* Avatar with Glow and Glass Border */}
          <div className="relative group shrink-0">
            <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full group-hover:bg-primary/50 transition-colors" />
            <UserAvatar
              avatarUrl={userData.photo_url || userData.avatar_url || userData.telegram_photo}
              displayName={userData.display_name}
              size="xl"
              className="relative border-4 border-primary/30 shadow-2xl"
            />
          </div>

          {/* User Information Details */}
          <div className="flex-1 w-full text-center sm:text-left space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-foreground drop-shadow-[0_0_10px_rgba(153,208,55,0.4)]">
                  {userData.display_name}
                </h1>
                {userData.username && (
                  <div className="mt-1 flex items-center justify-center sm:justify-start gap-2">
                    {tgLink ? (
                      <a
                        href={tgLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline flex items-center gap-1.5"
                      >
                        <Send size={15} />
                        <span>{userData.username.startsWith('@') ? userData.username : `@${userData.username}`}</span>
                        <ExternalLink size={13} className="opacity-70" />
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-primary">
                        {userData.username.startsWith('@') ? userData.username : `@${userData.username}`}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Role Badge and Online Indicator */}
              <div className="self-center sm:self-auto flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold backdrop-blur-md shadow-sm ${roleInfo.color}`}>
                  <ShieldCheck size={16} />
                  {roleInfo.label}
                </span>

                {Boolean(userData.is_online) ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-primary/15 text-primary border border-primary/35">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                    онлайн
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-background/30 text-foreground/45 border border-primary/15">
                    не в сети
                  </span>
                )}
              </div>
            </div>

            {/* Friend and Message Action Buttons (if not own profile) */}
            {!isOwnProfile && (
              <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <LeafButton
                  variant={isFriend ? "glass" : "primary"}
                  size="md"
                  onClick={handleToggleFriend}
                  disabled={friendLoading}
                  icon={friendLoading ? <Loader2 size={16} className="animate-spin" /> : isFriend ? <UserMinus size={17} /> : <UserPlus size={17} />}
                >
                  <span>{isFriend ? 'Удалить из друзей' : 'Добавить в друзья'}</span>
                </LeafButton>

                <LeafButton
                  variant="primary"
                  size="md"
                  onClick={() => {
                    if (isDemoOrUnregistered) {
                      openAuthModal('login');
                      return;
                    }
                    setIsChatOpen(true);
                  }}
                  icon={<MessageSquare size={17} />}
                >
                  <span>Написать сообщение</span>
                </LeafButton>
              </div>
            )}

            {/* Public Identification Badges */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
              {/* UID Badge */}
              <div
                onClick={() => copyToClipboard(userData.uid, setCopiedUid)}
                className="flex items-center gap-2 rounded-xl bg-background/30 backdrop-blur-md border border-primary/25 px-3.5 py-1.5 cursor-pointer hover:border-primary/50 hover:bg-background/40 transition-all shadow-sm group"
                title="Нажмите, чтобы скопировать UID"
              >
                <span className="text-sm font-bold text-foreground/60">UID:</span>
                <span className="text-sm font-mono font-bold text-primary">{userData.uid}</span>
                {copiedUid ? <Check size={16} className="text-primary" /> : <Copy size={16} className="text-foreground/40 group-hover:text-primary transition-colors" />}
              </div>

              {/* Telegram ID Badge */}
              {userData.telegram_id && (
                <div className="flex items-center gap-1.5 rounded-xl bg-blue-500/10 backdrop-blur-md border border-blue-500/25 px-3.5 py-1.5 text-sm font-medium text-blue-400">
                  <Send size={15} />
                  <span>ID телеграм: {userData.telegram_id}</span>
                </div>
              )}

              {/* Email Badge */}
              {userData.email && (
                <a
                  href={`mailto:${userData.email}`}
                  className="flex items-center gap-1.5 rounded-xl bg-primary/10 backdrop-blur-md border border-primary/25 px-3.5 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  <Mail size={15} />
                  <span>{userData.email}</span>
                </a>
              )}

              {/* Registration Date */}
              {userData.created_at && (
                <div className="flex items-center gap-1.5 rounded-xl bg-background/20 border border-foreground/10 px-3.5 py-1.5 text-sm text-foreground/60">
                  <Calendar size={15} />
                  <span>В игре с {new Date(userData.created_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Telegram Name and Surname Info */}
            {(userData.first_name || userData.last_name) && (
              <div className="pt-2 border-t border-primary/10 flex flex-wrap gap-4 text-xs sm:text-sm text-foreground/70 justify-center sm:justify-start">
                {userData.first_name && (
                  <div>
                    <span className="font-semibold text-foreground/50 mr-1.5">Имя телеграм:</span>
                    <span className="font-bold text-foreground">{userData.first_name}</span>
                  </div>
                )}
                {userData.last_name && (
                  <div>
                    <span className="font-semibold text-foreground/50 mr-1.5">Фамилия телеграм:</span>
                    <span className="font-bold text-foreground">{userData.last_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Public Statistics & Balances Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Balance Card */}
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/70">Баланс ИИкры</span>
            <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
              <Wallet size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-primary">{userData.balance}</span>
            <span className="text-sm font-bold text-foreground/80">{getIikrWord(userData.balance)}</span>
            <BubbleCurrencyIcon className="w-5 h-5" />
          </div>
          <div className="pt-1 flex flex-wrap gap-2 text-sm">
            <span className="px-2.5 py-0.5 rounded-lg bg-transparent border border-emerald-500/30 text-emerald-400 font-semibold">
              Оплаченный: {userData.balance_pay}
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-transparent border border-blue-500/30 text-blue-400 font-semibold">
              Бесплатный: {userData.balance_free}
            </span>
          </div>
        </div>

        {/* Games Won Card */}
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/70">Побед в играх</span>
            <div className="p-2 rounded-xl bg-transparent border border-yellow-500/30 text-yellow-400">
              <Trophy size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-foreground">{userData.games_won}</span>
            <span className="text-sm font-bold text-primary">
              ({userData.games_played > 0 ? Math.round((userData.games_won / userData.games_played) * 100) : 0}% побед)
            </span>
          </div>
          <p className="text-sm text-foreground/50">Успешно пройденных раундов</p>
        </div>

        {/* Games Played Card */}
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/70">Сыграно игр</span>
            <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
              <Gamepad2 size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-foreground">{userData.games_played}</span>
          </div>
          <p className="text-sm text-foreground/50">Всего игровых сессий</p>
        </div>

        {/* Total Score Card */}
        <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/70">Набрано очков</span>
            <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
              <Sparkles size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-primary">{userData.total_score}</span>
          </div>
          <p className="text-sm text-foreground/50">Суммарный счет за все игры</p>
        </div>
      </div>

      {/* Direct Chat Modal */}
      {myProfile?.uid && userData && (
        <DirectChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          currentUserUid={myProfile.uid}
          currentUserAvatar={myProfile.avatar_url || myProfile.photo_url || myProfile.telegram_photo}
          targetUser={{
            uid: userData.uid,
            display_name: userData.display_name,
            username: userData.username,
            avatar_url: userData.avatar_url,
            photo_url: userData.photo_url,
            telegram_photo: userData.telegram_photo,
            is_online: userData.is_online
          }}
        />
      )}
    </div>
  );
}
