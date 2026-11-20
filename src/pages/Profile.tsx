import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { calculateTopUpPriceRub, TOP_UP_DISCOUNT_TIERS, TOP_UP_PRESET_PACKS } from '../utils/pricing';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';
import { 
  Wallet, 
  History, 
  User as UserIcon, 
  Share2, 
  Trophy,
  Gamepad2,
  Settings,
  Loader2,
  Users,
  Mail,
  Send,
  LogOut,
  Copy,
  Check,
  Link as LinkIcon,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Globe,
  Lock,
  KeyRound,
  Upload,
  Image as ImageIcon,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCcw,
  Camera,
  X,
  Bell,
  CheckCheck,
  Trash2,
  Radio,
  ExternalLink,
  Clock,
  Eye,
  EyeOff,
  HelpCircle,
  Play,
  RotateCcw,
  Search,
  Coins,
  ArrowLeftRight,
  ShoppingCart,
  ShoppingBag,
  CreditCard,
  Zap,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Calendar,
  Type,
  Menu,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';
import { db } from '../db';
import { UserAvatar } from '../components/UserAvatar';
import { BubbleCurrencyIcon } from '../components/BubbleIcon';
import { formatIikr, getIikrWord, formatRub, getRubWord, formatPoints, getPointsWord } from '../lib/currency';
import { getUploadService } from '../services/FileUploadService';
import { NotificationModal, AppNotification } from '../components/NotificationModal';
import { NotificationsList } from '../components/NotificationsList';
import { NotificationsCenterModal } from '../components/NotificationsCenterModal';
import { NotificationSettingsModal } from '../components/NotificationSettingsModal';
import { PWAInstallAndPushCard } from '../components/pwa/PWAInstallAndPushCard';
import { IOSInstallGuideModal } from '../components/pwa/IOSInstallGuideModal';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from 'recharts';
import { getDifficultyLabel, getGameTitle } from '../lib/gameHelpers';
import { TopicCloud } from '../components/TopicCloud';
import { BubbleElement } from '../components/ui/BubbleElement';
import { LeafButton } from '../components/ui/LeafButton';
import { addRecentTopic, sortTopicsWithRecent } from '../utils/recentTopics';
import { FriendsTab } from '../components/FriendsTab';
import { ProfileMultiplayerView } from '../components/profile/ProfileMultiplayerView';
import { useProfileHistory, SESSIONS_PER_PAGE } from '../components/profile/useProfileHistory';
import { safeParseResponseJson } from '../utils/network/safeFetchJson';
import { audioSystem } from '../hooks/useSound';

interface ReferralUser {
  uid: string;
  id: string;
  display_name: string | null;
  username: string | null;
  photo_url: string | null;
  avatar_url: string | null;
  telegram_photo?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created_at: string;
}

interface ReferralStats {
  user_uid: string;
  referrals: ReferralUser[];
  referral_count: number;
  referral_earnings: number;
  referral_reward_balance: number;
  referrer: {
    uid: string;
    id: string;
    display_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
    avatar_url?: string | null;
    telegram_photo?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  referral_link_tma: string;
  referral_link_direct: string;
  referral_link_web?: string;
  direct_site_url: string;
}

interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  type: string;
  description: string;
  reference_id?: string;
  timestamp: number;
  created_at?: string;
}

export function ProfilePage() {
  const { profile, effectiveUid, effectiveBalance, openAuthModal, logout, refetchProfile, updateBalance } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Active sub-page tab routing
  const activeTab = (() => {
    const p = location.pathname.toLowerCase();
    if (p.startsWith('/profile/trans')) return 'trans';
    if (p.startsWith('/profile/ref')) return 'ref';
    if (p.startsWith('/profile/history')) return 'history';
    if (p.startsWith('/profile/multiplayer') || p.startsWith('/profile/lobby')) return 'multiplayer';
    if (p.startsWith('/profile/notif') || p.startsWith('/profile/notifications')) return 'notifications';
    if (p.startsWith('/profile/exchange')) return 'exchange';
    return 'profile';
  })();

  const setTab = (tab: 'profile' | 'trans' | 'ref' | 'history' | 'notifications' | 'exchange' | 'multiplayer') => {
    if (tab === 'profile') navigate('/profile');
    else if (tab === 'trans') navigate('/profile/trans');
    else if (tab === 'ref') navigate('/profile/ref');
    else if (tab === 'history') navigate('/profile/history');
    else if (tab === 'multiplayer') navigate('/profile/multiplayer');
    else if (tab === 'notifications') navigate('/profile/notifications');
    else if (tab === 'exchange') navigate('/profile/exchange');
  };

  // Copy feedback states
  const [copiedUid, setCopiedUid] = useState(false);
  const [copiedTmaLink, setCopiedTmaLink] = useState(false);
  const [copiedWebLink, setCopiedWebLink] = useState(false);
  const [copiedDirectLink, setCopiedDirectLink] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  // Profile Editor Form State
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [selectedAvatarSource, setSelectedAvatarSource] = useState<'telegram' | 'custom'>('custom');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveProfileMsg, setSaveProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password Change Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // PWA Install & Push Settings Modal State
  const [showProfileNotifSettings, setShowProfileNotifSettings] = useState(false);
  const pwaInstall = usePWAInstall();

  // Referral data
  const [referralData, setReferralData] = useState<ReferralStats | null>(null);
  const [loadingReferrals, setLoadingReferrals] = useState(false);

  // Transactions list
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transSearch, setTransSearch] = useState('');
  const [transTypeFilter, setTransTypeFilter] = useState<'all' | 'income' | 'expense' | 'failed'>('all');
  const [transGameFilter, setTransGameFilter] = useState<string>('all');
  const [transPage, setTransPage] = useState<number>(1);

  // Direct Rubles Top-up state (/profile/exchange)
  const [exchangeTopUpAmount, setExchangeTopUpAmount] = useState<number>(300);
  const [isTopUpProcessing, setIsTopUpProcessing] = useState(false);
  const [topUpFeedback, setTopUpFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'card'>('card');

  const handleExchangeTopUp = async () => {
    if (!profile) return;
    const amount = Number(exchangeTopUpAmount);
    if (!amount || amount <= 0) {
      setTopUpFeedback({ type: 'error', text: 'Укажите корректную сумму пополнения' });
      return;
    }

    const { discountPercent, finalPriceRub } = calculateTopUpPriceRub(amount);
    const rubleCost = finalPriceRub.toFixed(2);
    const discountNote = discountPercent > 0 ? `, скидка ${discountPercent}%` : '';
    setIsTopUpProcessing(true);
    setTopUpFeedback(null);

    const userId = effectiveUid || profile.uid || profile.id;
    try {
      const initRes = await fetch('/api/payments/robokassa/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          payPrice: Number(rubleCost),
          baseEnergy: amount,
          baseIikr: amount,
          discountPercent,
          email: profile.email || '',
          domain: window.location.origin,
          description: `Пополнение баланса Квайз на ${amount} ${getIikrWord(amount)} (${rubleCost} ₽${discountNote})`,
        }),
      });

      const initData = await initRes.json();
      if (initRes.ok && initData.paymentUrl) {
        window.location.href = initData.paymentUrl;
        return;
      }

      throw new Error(initData.error || 'Не удалось сформировать ссылку оплаты Робокассы');
    } catch (err: any) {
      console.error('Top-up error:', err);
      fetch('/api/payments/robokassa/report-fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          iikr: amount,
          outSum: Number(rubleCost),
          reason: err.message || 'ошибка при переходе к оплате',
          domain: window.location.origin,
        }),
      }).catch(() => {});
      setTopUpFeedback({ type: 'error', text: err.message || 'Ошибка при переходе к оплате Робокассы' });
    } finally {
      setIsTopUpProcessing(false);
    }
  };

  // Points Exchange state
  const [exchangePointsInput, setExchangePointsInput] = useState<string>('10000');
  const [isExchanging, setIsExchanging] = useState(false);
  const [exchangeFeedback, setExchangeFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExchangePoints = async (overridePoints?: number) => {
    const rawVal = overridePoints !== undefined ? overridePoints : Number(exchangePointsInput);
    const pts = Math.floor(rawVal || 0);
    const available = Number(profile?.total_points ?? profile?.points ?? 0);

    if (pts < 10000) {
      audioSystem.playSlot('ui_error_alert');
      setExchangeFeedback({ type: 'error', text: `Минимальное количество для обмена — ${formatPoints(10000)}` });
      return;
    }
    if (pts > available) {
      audioSystem.playSlot('ui_error_alert');
      setExchangeFeedback({
        type: 'error',
        text: `Недостаточно очков для обмена. У вас ${formatPoints(available)}, запрошено ${formatPoints(pts)}`
      });
      return;
    }

    setIsExchanging(true);
    setExchangeFeedback(null);
    try {
      const res = await fetch('/api/users/exchange-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUid || profile?.uid || profile?.id,
          pointsToExchange: pts
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка при обмене очков');
      }

      audioSystem.playSlot('fx_points_to_iikr_exchange');
      audioSystem.playSlot('ui_iikr_receive');

      setExchangeFeedback({
        type: 'success',
        text: `Успешно обменено ${formatPoints(data.exchangedPoints)} на ${formatIikr(data.iikrEarned)}. Зачислено в баланс ballance_point!`
      });

      await refetchProfile();
      fetchTransactions();
    } catch (err: any) {
      console.error('Exchange error:', err);
      audioSystem.playSlot('ui_error_alert');
      setExchangeFeedback({ type: 'error', text: err.message || 'Не удалось выполнить обмен очков' });
    } finally {
      setIsExchanging(false);
    }
  };

  // Top-up modal state
  const [showPayment, setShowPayment] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(0);
  const [paymentStep, setPaymentStep] = useState<'calculator' | 'processing' | 'success'>('calculator');
  const [shopFeedback, setShopFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTopUpPayment = async () => {
    if (!profile) return;
    setPaymentStep('processing');
    const pricing = calculateTopUpPriceRub(topUpAmount);
    const userId = effectiveUid || profile.uid || profile.id;
    try {
      const res = await fetch('/api/payments/robokassa/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          payPrice: Number(pricing.finalPriceRub.toFixed(2)),
          baseEnergy: topUpAmount,
          baseIikr: topUpAmount,
          discountPercent: pricing.discountPercent,
          email: profile.email || '',
          domain: window.location.origin,
        }),
      });
      const data = await res.json();
      if (res.ok && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }
      throw new Error(data.error || 'Ошибка инициализации платежа');
    } catch (error: any) {
      console.error('Payment error:', error);
      fetch('/api/payments/robokassa/report-fail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          iikr: topUpAmount,
          outSum: Number(pricing.finalPriceRub.toFixed(2)),
          reason: error?.message || 'ошибка инициализации платежа',
          domain: window.location.origin,
        }),
      }).catch(() => {});
      audioSystem.playSlot('ui_error_alert');
      setPaymentStep('calculator');
    }
  };

  // Game History State & Sequential Batch Loader
  const resolvedHistoryUid = profile?.uid || profile?.id || effectiveUid;
  const {
    gameHistory,
    setGameHistory,
    savedPacks,
    setSavedPacks,
    gameProgressList,
    setGameProgressList,
    packsTotalCount,
    progressTotalCount,
    sessionsTotalCount,
    hasMorePacks,
    hasMoreProgress,
    loadingHistory,
    loadingMorePacks,
    loadingMoreProgress,
    loadingSessionsPage,
    questionStats,
    sessionStats,
    gameStats,
    historySubTab,
    setHistorySubTab,
    historyGameFilter,
    setHistoryGameFilter,
    historyModeFilter,
    setHistoryModeFilter,
    historyDifficultyFilter,
    setHistoryDifficultyFilter,
    historyResultFilter,
    setHistoryResultFilter,
    sessionsPage,
    setSessionsPage,
    historyTopicFilter,
    setHistoryTopicFilter,
    historySearch,
    setHistorySearch,
    historySortBy,
    setHistorySortBy,
    historySortOrder,
    setHistorySortOrder,
    fetchHistory,
    loadMorePacks,
    loadMoreProgress,
    goToSessionsPage,
    packsSentinelRef,
    progressSentinelRef
  } = useProfileHistory({
    targetUid: resolvedHistoryUid,
    isHistoryTabActive: activeTab === 'history'
  });
  const [launchingPackId, setLaunchingPackId] = useState<string | null>(null);

  const handleSelectSort = (option: 'date' | 'title' | 'topic' | 'gameType') => {
    if (historySortBy === option) {
      setHistorySortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setHistorySortBy(option);
      setHistorySortOrder(option === 'date' ? 'desc' : 'asc');
    }
  };

  // Modal to inspect played questions
  const [selectedPackForQuestions, setSelectedPackForQuestions] = useState<{ pack: any; progress?: any } | null>(null);
  const [activePackQuestions, setActivePackQuestions] = useState<any[]>([]);
  const [loadingPackQuestions, setLoadingPackQuestions] = useState(false);

  // Topic filter modal state
  const [isHistoryTopicModalOpen, setIsHistoryTopicModalOpen] = useState(false);
  const [isHistoryFiltersModalOpen, setIsHistoryFiltersModalOpen] = useState(false);
  const [isMobileStatsOpen, setIsMobileStatsOpen] = useState(false);
  const [isMobileMenuOpenState, setIsMobileMenuOpenState] = useState(false);

  useEffect(() => {
    const handleMenuState = (e: any) => {
      if (e?.detail && typeof e.detail.open === 'boolean') {
        setIsMobileMenuOpenState(e.detail.open);
      }
    };
    window.addEventListener('profile-menu-state', handleMenuState);
    return () => window.removeEventListener('profile-menu-state', handleMenuState);
  }, []);
  const [historyDbTopics, setHistoryDbTopics] = useState<string[]>([]);
  const [historyTotalTopicsCount, setHistoryTotalTopicsCount] = useState<number>(0);
  const [historyTopicSearch, setHistoryTopicSearch] = useState('');
  const [isSearchingHistoryTopics, setIsSearchingHistoryTopics] = useState(false);

  // Fetch topics for history topic filter modal
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out) return;
    const controller = new AbortController();
    const fetchHistoryTopics = async () => {
      if (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out) return;
      setIsSearchingHistoryTopics(true);
      try {
        const query = historyTopicSearch.trim();
        const activeUid = profile?.uid || profile?.id || effectiveUid || '10016926299';
        const url = `/api/topics?limit=100${query ? `&q=${encodeURIComponent(query)}` : ''}&user_id=${encodeURIComponent(activeUid)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            const topicNames = json.data.map((t: any) => t.name);
            const sorted = sortTopicsWithRecent(topicNames, json.recentTopics);
            setHistoryDbTopics(sorted);
            setHistoryTotalTopicsCount(json.totalCount || topicNames.length);
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (
          err?.name !== 'AbortError' &&
          !msg.includes('Failed to fetch') &&
          !msg.includes('NetworkError') &&
          !msg.includes('Load failed') &&
          !(typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)
        ) {
          console.error('Error fetching history topics:', err);
        }
      } finally {
        setIsSearchingHistoryTopics(false);
      }
    };
    const timer = setTimeout(fetchHistoryTopics, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [historyTopicSearch, profile?.uid, profile?.id, effectiveUid]);

  // Fetch real-time question statistics from database when pack is selected (hydrate full pack if summary)
  useEffect(() => {
    if (!selectedPackForQuestions?.pack) {
      setActivePackQuestions([]);
      return;
    }
    const pack = selectedPackForQuestions.pack;
    let cancelled = false;
    setLoadingPackQuestions(true);
    const uidParam = effectiveUid ? `&user_id=${encodeURIComponent(String(effectiveUid))}` : '';

    const loadPackModalQuestions = async () => {
      try {
        const res = await fetch(`/api/generated-questions?pack_id=${encodeURIComponent(String(pack.id))}${uidParam}`);
        const json = res.ok ? await safeParseResponseJson<any>(res) : null;
        if (!cancelled && Array.isArray(json?.data) && json.data.length > 0) {
          setActivePackQuestions(json.data);
          return;
        }
        if (Array.isArray(pack.questions) && pack.questions.length > 0) {
          if (!cancelled) setActivePackQuestions(pack.questions);
          return;
        }
        const fullRes = await fetch(`/api/game-packs/${encodeURIComponent(String(pack.id))}${effectiveUid ? `?user_id=${encodeURIComponent(String(effectiveUid))}` : ''}`);
        const fullJson = fullRes.ok ? await safeParseResponseJson<any>(fullRes) : null;
        if (!cancelled) {
          setActivePackQuestions(Array.isArray(fullJson?.data?.questions) ? fullJson.data.questions : []);
        }
      } catch {
        if (!cancelled) {
          let fallback: any[] = [];
          if (Array.isArray(pack.questions)) fallback = pack.questions;
          else if (typeof pack.questions === 'string') {
            try { fallback = JSON.parse(pack.questions); } catch {}
          }
          setActivePackQuestions(fallback);
        }
      } finally {
        if (!cancelled) setLoadingPackQuestions(false);
      }
    };

    loadPackModalQuestions();
    return () => {
      cancelled = true;
    };
  }, [selectedPackForQuestions, effectiveUid]);

  // Sync URL query params with history filters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const gameParam = params.get('game') || params.get('game_id');
    const modeParam = params.get('mode') || params.get('play_mode');
    const diffParam = params.get('difficulty');
    const topicParam = params.get('topic');
    if (gameParam) setHistoryGameFilter(gameParam);
    if (modeParam === 'single' || modeParam === 'multi' || modeParam === 'all') {
      setHistoryModeFilter(modeParam);
    }
    if (diffParam) setHistoryDifficultyFilter(diffParam);
    if (topicParam) setHistoryTopicFilter(topicParam);
  }, [location.search]);

  // Notifications State
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [totalNotificationsCount, setTotalNotificationsCount] = useState(0);
  const [readNotificationsCount, setReadNotificationsCount] = useState(0);
  const [selectedNotificationForModal, setSelectedNotificationForModal] = useState<AppNotification | null>(null);
  const [showNotificationsCenter, setShowNotificationsCenter] = useState(false);
  const [unreadFriendsMessagesCount, setUnreadFriendsMessagesCount] = useState(0);

  // Email linking form state in Profile Tab
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Populate form with current profile data
  useEffect(() => {
    if (profile) {
      setEditDisplayName(profile.display_name || '');
      setEditEmail(profile.email || '');
      setEditUsername(profile.username || '');
      setEditFirstName(profile.first_name || '');
      setEditLastName(profile.last_name || '');
      setEditAvatarUrl(profile.avatar_url || '');

      // Determine active avatar source (priority is custom uploaded avatar unless explicitly set to 'telegram')
      if (profile.avatar_source === 'telegram' && profile.telegram_photo) {
        setSelectedAvatarSource('telegram');
      } else if (profile.avatar_url && profile.avatar_url !== profile.telegram_photo) {
        setSelectedAvatarSource('custom');
      } else if (profile.telegram_photo) {
        setSelectedAvatarSource('telegram');
      } else {
        setSelectedAvatarSource('custom');
      }
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.uid) {
      fetchReferralStats();
      fetchTransactions();
      fetchUnreadNotificationsCount();
      fetchUnreadFriendsMessagesCount();
      const chatInterval = setInterval(fetchUnreadFriendsMessagesCount, 10000);
      return () => clearInterval(chatInterval);
    }
  }, [profile?.uid]);

  useEffect(() => {
    const handleBalanceEvent = () => {
      if (refetchProfile) {
        refetchProfile();
      }
      fetchTransactions();
    };

    window.addEventListener('balance_updated', handleBalanceEvent);

    return () => {
      window.removeEventListener('balance_updated', handleBalanceEvent);
    };
  }, [refetchProfile, profile?.uid]);

  const fetchUnreadFriendsMessagesCount = async () => {
    if (!profile?.uid) return;
    try {
      let res = await fetch(`/api/friends/unread-count?userId=${encodeURIComponent(profile.uid)}`);
      if (!res.ok) {
        res = await fetch(`/api/direct-messages/unread-count?user_id=${encodeURIComponent(profile.uid)}`);
      }
      if (res.ok) {
        const json = await res.json();
        const count = json.unread_messages_count !== undefined 
          ? json.unread_messages_count 
          : (json.unread_count || 0);
        setUnreadFriendsMessagesCount(count);
      }
    } catch (_) {}
  };

  const fetchUnreadNotificationsCount = async () => {
    if (!profile?.uid || (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) return;
    try {
      const res = await fetch(`/api/notifications/unread-count?user_id=${encodeURIComponent(profile.uid)}`);
      if (res.ok) {
        const json = await res.json();
        setUnreadNotificationsCount(json.unread_count || 0);
        setTotalNotificationsCount(json.total_count || 0);
        setReadNotificationsCount(json.read_count || 0);
      }
    } catch (_) {}
  };

  const fetchReferralStats = async () => {
    if (!profile?.uid || (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) return;
    setLoadingReferrals(true);
    try {
      const res = await fetch(`/api/users/referrals/${encodeURIComponent(profile.uid)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setReferralData(json.data);
        }
      }
    } catch (_) {
    } finally {
      setLoadingReferrals(false);
    }
  };

  const fetchTransactions = async () => {
    if (!profile?.uid || (typeof window !== 'undefined' && (window as any).__qaiz_is_logging_out)) return;
    setLoadingTransactions(true);
    try {
      const res = await fetch(`/api/transactions/user/${encodeURIComponent(profile.uid)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setTransactions(json.data);
        }
      }
    } catch (_) {
    } finally {
      setLoadingTransactions(false);
    }
  };

  const formatMpCountdownSec = (sec?: number | null) => {
    if (typeof sec !== 'number' || sec <= 0) return null;
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleResumeProgress = async (prog: any, packObj?: any, customQuestionIdx?: number) => {
    const progData = prog || {};
    const stateObj = typeof progData.state === 'string'
      ? (() => { try { return JSON.parse(progData.state || '{}'); } catch { return {}; } })()
      : (progData.state || {});
    const mpRoomId = progData.mp_room_id || packObj?.mp_room_id || stateObj?.mpRoomId;
    const isMp = Boolean(
      progData.is_multiplayer ||
      packObj?.is_multiplayer ||
      stateObj?.isMultiplayer ||
      stateObj?.playMode === 'multi' ||
      mpRoomId
    );
    const mpStatus = progData.mp_status || packObj?.mp_status || (isMp ? 'active' : null);
    const mpMyFinished = Boolean(progData.mp_my_finished || packObj?.mp_my_finished);

    const gameType = progData.game_type || progData.game_id || packObj?.game_id || 'blitz';
    const gamePath = 
      gameType === 'blitz' ? '/game/blitz' :
      gameType === 'millionaire' ? '/game/millionaire' :
      gameType === 'whatwherewhen' ? '/game/whatwherewhen' :
      gameType === '100to1' ? '/game/100to1' :
      gameType === 'jeopardy' ? '/game/jeopardy' :
      gameType === 'melody' ? '/game/melody' : `/game/${gameType}`;

    if (isMp && mpRoomId) {
      const resolvedPackId = progData?.pack_id || packObj?.id;
      if (gameType === 'jeopardy' && (mpStatus === 'waiting' || mpStatus === 'active')) {
        const queryParams = new URLSearchParams();
        queryParams.set('room', mpRoomId);
        if (resolvedPackId) queryParams.set('pack', resolvedPackId);
        queryParams.set('mode', 'multi');
        navigate(`/game/jeopardy?${queryParams.toString()}`, {
          state: {
            mode: 'lite',
            playMode: 'multi',
            multiMode: 'online',
            mpRoomId,
            roomId: mpRoomId,
            packId: resolvedPackId,
            resume: true,
            resumeMultiplayer: true,
            fromMultiplayerLobby: true,
            topic: stateObj.gameTopic || progData?.topic || stateObj.topic || packObj?.topic || 'Общие знания',
            difficulty: progData?.difficulty || stateObj.difficulty || packObj?.difficulty || 'people'
          }
        });
        return;
      }
      // If lobby is waiting, or player already finished and is waiting for others -> open room lobby/results
      if ((mpStatus === 'waiting' || (mpStatus === 'finished' && mpMyFinished) || mpMyFinished) && customQuestionIdx === undefined) {
        navigate(`/multiplayer/room/${mpRoomId}`);
        return;
      }
      // Active or unfinished multiplayer game where user has not finished yet -> resume directly into the game at their current question!
      const fallbackStep = typeof progData.current_step === 'number'
        ? progData.current_step
        : typeof packObj?.current_step === 'number'
        ? packObj.current_step
        : 0;
      const savedRound1Based = customQuestionIdx !== undefined
        ? customQuestionIdx + 1
        : Math.max(1, Number(progData.mp_my_round || packObj?.mp_my_round || (fallbackStep + 1)) || 1);
      const resolvedTargetIdx = customQuestionIdx !== undefined ? customQuestionIdx : Math.max(0, savedRound1Based - 1);
      const queryParams = new URLSearchParams();
      queryParams.set('room', mpRoomId);
      if (resolvedPackId) queryParams.set('pack', resolvedPackId);
      queryParams.set('mode', 'multi');

      let mpQuestions: any[] = [];
      if (Array.isArray(progData.questions) && progData.questions.length > 0) mpQuestions = progData.questions;
      else if (Array.isArray(stateObj.questions) && stateObj.questions.length > 0) mpQuestions = stateObj.questions;
      else if (packObj && Array.isArray(packObj.questions) && packObj.questions.length > 0) mpQuestions = packObj.questions;

      navigate(`${gamePath}?${queryParams.toString()}`, {
        state: {
          mode: 'lite',
          playMode: 'multi',
          multiMode: 'online',
          mpRoomId,
          roomId: mpRoomId,
          packId: resolvedPackId,
          resume: true,
          resumeMultiplayer: true,
          fromMultiplayerLobby: true,
          currentIndex: resolvedTargetIdx,
          savedRoundIndex: resolvedTargetIdx,
          forcedQuestionIndex: resolvedTargetIdx,
          score: typeof progData?.mp_my_score === 'number' ? progData.mp_my_score : (typeof progData?.score === 'number' ? progData.score : 0),
          topic: stateObj.gameTopic || progData?.topic || stateObj.topic || packObj?.topic || 'Общие знания',
          difficulty: progData?.difficulty || stateObj.difficulty || packObj?.difficulty || 'people',
          questions: mpQuestions.length > 0 ? mpQuestions : undefined,
          preloadedQuestions: mpQuestions.length > 0 ? mpQuestions : undefined
        }
      });
      return;
    }

    if (progData.topic || packObj?.topic) {
      addRecentTopic(progData.topic || packObj?.topic);
    }

    let rawQuestions: any[] = [];
    if (Array.isArray(progData.questions) && progData.questions.length > 0) {
      rawQuestions = progData.questions;
    } else if (Array.isArray(stateObj.questions) && stateObj.questions.length > 0) {
      rawQuestions = stateObj.questions;
    } else if (packObj && Array.isArray(packObj.questions) && packObj.questions.length > 0) {
      rawQuestions = packObj.questions;
    } else if (packObj && typeof packObj.questions === 'string') {
      try {
        const parsed = JSON.parse(packObj.questions);
        if (Array.isArray(parsed)) rawQuestions = parsed;
      } catch (_) {}
    }
    const hydratePackId = progData?.pack_id || packObj?.id;
    if (rawQuestions.length === 0 && hydratePackId) {
      try {
        const activeUid = effectiveUid || profile?.uid || profile?.id;
        const qRes = await fetch(`/api/game-packs/${encodeURIComponent(String(hydratePackId))}${activeUid ? `?user_id=${encodeURIComponent(String(activeUid))}` : ''}`);
        const qJson = qRes.ok ? await safeParseResponseJson<any>(qRes) : null;
        if (Array.isArray(qJson?.data?.questions) && qJson.data.questions.length > 0) {
          rawQuestions = qJson.data.questions;
        }
      } catch (_) {}
    }

    const progStep = typeof stateObj.currentIndex === 'number' 
      ? stateObj.currentIndex 
      : (typeof progData.current_step === 'number' ? progData.current_step : 0);

    const isWhatWhereWhen = gameType === 'whatwherewhen' || packObj?.game_id === 'whatwherewhen' || packObj?.game_title === 'ЧтоГдеКвада' || (typeof packObj?.title === 'string' && (packObj.title.includes('Что? Где?') || packObj.title.includes('ЧтоГдеКвада')));

    const normalizedQuestions = rawQuestions.map((q: any, i: number) => {
      const qText = q.text || q.question || q.prompt || `Вопрос №${i + 1}`;
      const qAns = q.correct_answer || q.answer || q.correctAnswer || q.correct || '';
      let opts: string[] = [];
      if (Array.isArray(q.options)) {
        opts = q.options;
      } else if (q.options_json) {
        try {
          const parsed = JSON.parse(q.options_json);
          if (Array.isArray(parsed)) opts = parsed;
        } catch (_) {}
      }

      // Authoritative completion: difference between times_shown and times_answered (correct + incorrect + skipped)
      const timesShown = Number(q.times_shown || 0);
      const timesAnswered = Number(q.times_correct || 0) + Number(q.times_incorrect || 0) + Number(q.times_skipped || 0);
      const isPending = timesShown > timesAnswered;
      const isFullyAnswered = !isPending && ((timesAnswered >= timesShown && timesAnswered > 0) || q.is_answered === 1 || !!q.user_answer);

      const isAns = isWhatWhereWhen
        ? (isFullyAnswered || (Array.isArray(stateObj.answeredIndices) && stateObj.answeredIndices.includes(i)))
        : (isFullyAnswered || (!isPending && i < progStep));

      return {
        ...q,
        id: q.id || `gq_${progData?.pack_id || packObj?.id || 'pack'}_${i + 1}`,
        text: qText,
        question: qText,
        correctAnswer: qAns,
        answer: qAns,
        options: opts,
        hint: q.hint || '',
        explanation: q.explanation || q.comment || q.fact || '',
        is_answered: isAns ? 1 : 0
      };
    });

    let targetIdx = progStep;
    // Check difference between shown and answered questions across the pack
    const pendingIdx = rawQuestions.findIndex((q: any) => {
      const shown = Number(q.times_shown || 0);
      const ans = Number(q.times_correct || 0) + Number(q.times_incorrect || 0) + Number(q.times_skipped || 0);
      return shown > ans;
    });

    if (pendingIdx !== -1) {
      targetIdx = pendingIdx;
    } else if (gameType === 'millionaire') {
      targetIdx = progStep;
    } else if (isWhatWhereWhen) {
      const answeredList: number[] = Array.isArray(stateObj.answeredIndices) ? stateObj.answeredIndices : [];
      if (typeof stateObj.currentIndex === 'number' && !answeredList.includes(stateObj.currentIndex)) {
        targetIdx = stateObj.currentIndex;
      } else {
        const nextUnanswered = rawQuestions.findIndex((q: any, idx: number) => {
          const isAns = q.is_answered === 1 || !!q.user_answer || answeredList.includes(idx);
          const isSkip = q.is_skipped === 1 || q.times_skipped > 0 || q.user_answer === 'Не знаю' || q.user_answer === 'Не знаю ответ' || q.user_answer === 'Пропущено' || q.user_answer === 'Время вышло';
          return !isAns && !isSkip;
        });
        targetIdx = nextUnanswered !== -1 ? nextUnanswered : 0;
      }
    } else {
      const firstUnansweredIdx = normalizedQuestions.findIndex((q: any, idx: number) => {
        const isAns = q.is_answered === 1 || !!q.user_answer || idx < progStep;
        const isSkip = q.is_skipped === 1 || q.times_skipped > 0 || q.user_answer === 'Не знаю ответ' || q.user_answer === 'Пропущено';
        return !isAns && !isSkip;
      });
      targetIdx = firstUnansweredIdx !== -1 ? firstUnansweredIdx : progStep;
    }

    navigate(gamePath, {
      state: {
        packId: progData?.pack_id || packObj?.id,
        playMode: isMp ? 'multi' : 'single',
        multiMode: isMp ? 'online' : undefined,
        mpRoomId: mpRoomId || undefined,
        roomId: mpRoomId || undefined,
        resume: true,
        resumeMultiplayer: isMp ? true : undefined,
        currentIndex: targetIdx,
        score: typeof progData?.score === 'number' ? progData.score : (stateObj.expertScore ?? stateObj.score ?? 0),
        viewerScore: typeof stateObj.viewerScore === 'number' ? stateObj.viewerScore : 0,
        topic: stateObj.gameTopic || progData?.topic || stateObj.topic || packObj?.topic,
        difficulty: progData?.difficulty || stateObj.difficulty || packObj?.difficulty,
        questions: normalizedQuestions.length > 0 ? normalizedQuestions : undefined
      }
    });
  };

  const handleDeleteProgress = async (progId: string) => {
    try {
      await fetch(`/api/game_progress/${progId}`, { method: 'DELETE' });
      setGameProgressList(prev => prev.filter(p => p.id !== progId));
    } catch (err) {
      console.error('Error deleting progress:', err);
    }
  };

  const handlePlayPack = async (pack: any) => {
    const activeUid = effectiveUid || profile?.uid || profile?.id || 'usr_guest';
    let packQuestions = Array.isArray(pack.questions) ? pack.questions : [];
    setLaunchingPackId(pack.id || null);

    try {
      // If loaded via summary=1 batch without heavy questions array, fetch full questions for this single pack
      if (packQuestions.length === 0 && pack.id) {
        const fullRes = await fetch(`/api/game-packs/${encodeURIComponent(String(pack.id))}?user_id=${encodeURIComponent(String(activeUid))}`);
        const fullJson = fullRes.ok ? await safeParseResponseJson<any>(fullRes) : null;
        if (Array.isArray(fullJson?.data?.questions)) {
          packQuestions = fullJson.data.questions;
        }
      }

      // Asynchronously trigger server to increment play_count and question times_shown
      fetch(`/api/game-packs/${pack.id}/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: activeUid, is_replay: true })
      }).catch(err => console.error('Play pack replay error:', err));

      // Instantly update client-side state so UI card increments play_count by +1 and clears unfinished state
      setSavedPacks(prev => prev.map(p => {
        if (p.id === pack.id) {
          return {
            ...p,
            play_count: (Number(p.play_count) || 1) + 1,
            is_unfinished: false,
            current_step: 0
          };
        }
        return p;
      }));
      setGameProgressList(prev => prev.filter(pr => pr && pr.pack_id !== pack.id));
    } catch (e) {
      console.error('Error in handlePlayPack replay:', e);
    } finally {
      setLaunchingPackId(null);
    }

    const gamePath = 
      pack.game_id === 'blitz' ? '/game/blitz' :
      pack.game_id === 'millionaire' ? '/game/millionaire' :
      pack.game_id === 'whatwherewhen' ? '/game/whatwherewhen' :
      pack.game_id === '100to1' ? '/game/100to1' :
      pack.game_id === 'jeopardy' ? '/game/jeopardy' :
      pack.game_id === 'melody' ? '/game/melody' : `/game/${pack.game_id}`;

    if (pack.topic) {
      addRecentTopic(pack.topic);
    }

    navigate(gamePath, {
      state: {
        mode: 'lite',
        difficulty: pack.difficulty || 'people',
        price: 0,
        topic: pack.topic,
        questions: packQuestions,
        packId: pack.id,
        isReplay: true
      }
    });
  };

  // Instant switch active avatar source between Telegram photo and custom uploaded photo
  const handleQuickSwitchAvatar = async (source: 'telegram' | 'custom') => {
    if (!profile?.uid) return;
    setSelectedAvatarSource(source);

    const targetPhotoUrl = source === 'telegram' 
      ? (profile.telegram_photo || null)
      : (editAvatarUrl || profile.avatar_url || null);

    try {
      const res = await fetch(`/api/users/${profile.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photo_url: targetPhotoUrl,
          avatar_url: editAvatarUrl || profile.avatar_url || null,
          telegram_photo: profile.telegram_photo || null,
          avatar_source: source,
        })
      });

      if (res.ok) {
        await refetchProfile(profile.uid);
        setSaveProfileMsg({ 
          type: 'success', 
          text: source === 'telegram' 
            ? 'Активирована фотография из Telegram' 
            : 'Активирована пользовательская аватарка' 
        });
        setTimeout(() => setSaveProfileMsg(null), 3000);
      }
    } catch (err: any) {
      console.error('Quick switch avatar error:', err);
    }
  };

  // Clear custom avatar while preserving telegram_photo
  const handleRemoveCustomAvatar = async () => {
    if (!profile?.uid) return;
    setEditAvatarUrl('');
    setSelectedAvatarSource('telegram');

    try {
      const res = await fetch(`/api/users/${profile.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatar_url: null,
          photo_url: profile.telegram_photo || null,
          telegram_photo: profile.telegram_photo || null,
          avatar_source: 'telegram',
        })
      });

      if (res.ok) {
        await refetchProfile(profile.uid);
        setSaveProfileMsg({ type: 'success', text: 'Пользовательская аватарка удалена. Активным установлено фото из Telegram.' });
        setTimeout(() => setSaveProfileMsg(null), 3000);
      }
    } catch (err: any) {
      console.error('Error removing custom avatar:', err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;

    setSavingProfile(true);
    setSaveProfileMsg(null);

    try {
      const formattedUsername = editUsername.trim()
        ? editUsername.trim().startsWith('@')
          ? editUsername.trim()
          : `@${editUsername.trim()}`
        : null;

      // Determine active photo_url based on selected avatar source
      const effectivePhotoUrl = selectedAvatarSource === 'telegram'
        ? (profile.telegram_photo || editAvatarUrl.trim() || null)
        : (editAvatarUrl.trim() || profile.telegram_photo || null);

      const payload: Record<string, any> = {
        display_name: editDisplayName.trim() || 'Игрок',
        username: formattedUsername,
        first_name: editFirstName.trim() || null,
        last_name: editLastName.trim() || null,
        telegram_photo: profile.telegram_photo || null,
        avatar_url: editAvatarUrl.trim() || null,
        photo_url: effectivePhotoUrl,
        avatar_source: selectedAvatarSource,
      };

      if (editEmail.trim()) {
        payload.email = editEmail.trim().toLowerCase();
      }

      const res = await fetch(`/api/users/${profile.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Ошибка при сохранении профиля');
      }

      setSaveProfileMsg({ type: 'success', text: 'Данные профиля успешно обновлены' });
      await refetchProfile(profile.uid);
      setTimeout(() => setSaveProfileMsg(null), 4000);
    } catch (err: any) {
      setSaveProfileMsg({ type: 'error', text: err.message || 'Не удалось сохранить профиль' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      alert('Размер файла не должен превышать 15 МБ');
      return;
    }

    setUploadingAvatar(true);
    setSaveProfileMsg(null);

    try {
      const uploadService = getUploadService();
      const result = await uploadService.uploadAndStore(file, 'avatars', undefined, profile?.uid || null);
      const finalUrl = result.directUrl || result.url;
      setEditAvatarUrl(finalUrl);
      setSelectedAvatarSource('custom');

      // Also automatically update user record
      if (profile?.uid) {
        await fetch(`/api/users/${profile.uid}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            avatar_url: finalUrl,
            photo_url: finalUrl,
            telegram_photo: profile.telegram_photo || null,
            avatar_source: 'custom',
          })
        });
        await refetchProfile(profile.uid);
      }

      setSaveProfileMsg({ type: 'success', text: 'Новая фотография успешно загружена и установлена как активная!' });
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setSaveProfileMsg({ type: 'error', text: err.message || 'Ошибка загрузки фотографии на сервер' });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleDeleteNotification = async (id: number) => {
    try {
      await fetch('/api/notifications/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      fetchUnreadNotificationsCount();
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid) return;

    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'error', text: 'Новый пароль должен быть не менее 6 символов' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'Пароли не совпадают' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMsg(null);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: profile.uid,
          oldPassword,
          newPassword
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Ошибка смены пароля');
      }

      setPasswordMsg({ type: 'success', text: 'Пароль успешно изменен!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordMsg(null);
      }, 2000);
    } catch (err: any) {
      setPasswordMsg({ type: 'error', text: err.message || 'Не удалось сменить пароль' });
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.uid || !linkEmail || !linkPassword) return;

    setLinkLoading(true);
    setLinkMessage(null);

    try {
      const res = await fetch('/api/auth/link-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: profile.uid,
          email: linkEmail.trim().toLowerCase(),
          password: linkPassword
        })
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Не удалось привязать email');
      }

      const targetUid = json.data?.uid || profile.uid;
      if (json.data) {
        localStorage.setItem('user_session', JSON.stringify(json.data));
      }
      setLinkMessage({
        type: 'success',
        text: json.message || 'Email успешно привязан к вашему аккаунту!'
      });
      setLinkEmail('');
      setLinkPassword('');
      await refetchProfile(targetUid);
      fetchTransactions();
      setTimeout(() => setLinkMessage(null), 5000);
    } catch (err: any) {
      setLinkMessage({ type: 'error', text: err.message || 'Ошибка привязки email' });
    } finally {
      setLinkLoading(false);
    }
  };

  const handleInstantLinkTelegram = async () => {
    if (!profile?.uid) return;
    const tg = (window as any).Telegram?.WebApp;
    const initData = tg?.initData || '';
    const unsafeUser = tg?.initDataUnsafe?.user || null;

    if (!initData && !unsafeUser?.id) {
      window.open(`https://t.me/qaiz_aibot/app?startapp=link_${profile.uid}`, '_blank', 'noopener,noreferrer');
      return;
    }

    setLinkLoading(true);
    setLinkMessage(null);
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData,
          unsafeUser,
          startParam: `link_${profile.uid}`,
          existingUid: profile.uid
        })
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Не удалось привязать Telegram');
      }
      const targetUid = json.data?.uid || profile.uid;
      if (json.data) {
        localStorage.setItem('user_session', JSON.stringify(json.data));
      }
      setLinkMessage({
        type: 'success',
        text: json.message || 'Аккаунты Telegram и почты успешно объединены!'
      });
      await refetchProfile(targetUid);
      fetchTransactions();
      setTimeout(() => setLinkMessage(null), 5000);
    } catch (err: any) {
      setLinkMessage({ type: 'error', text: err.message || 'Ошибка привязки Telegram' });
    } finally {
      setLinkLoading(false);
    }
  };

  const copyToClipboard = (text: string, setCopied: (v: boolean) => void) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const amt = Number(t.amount) || 0;
      const typeLower = String(t.type || '').toLowerCase();
      const descLower = String(t.description || '').toLowerCase();
      const isFailed =
        typeLower === 'payment_failed' ||
        typeLower.includes('fail') ||
        descLower.includes('неудачная попытка оплаты') ||
        descLower.includes('платеж отменен или отклонен');

      // Type filter: income (amount > 0) vs expense (amount < 0) vs failed
      if (transTypeFilter === 'income' && (amt <= 0 || isFailed)) return false;
      if (transTypeFilter === 'expense' && (amt >= 0 || isFailed)) return false;
      if (transTypeFilter === 'failed' && !isFailed) return false;

      // Game filter
      if (transGameFilter !== 'all') {
        const desc = (t.description || '').toLowerCase();
        const type = (t.type || '').toLowerCase();
        const ref = (t.reference_id || '').toLowerCase();
        const combined = `${desc} ${type} ${ref}`;
        if (transGameFilter === 'blitz' && !(combined.includes('блиц') || combined.includes('blitz') || combined.includes('квииз'))) return false;
        if (transGameFilter === 'millionaire' && !(combined.includes('миллионер') || combined.includes('millionaire') || combined.includes('квиллионер'))) return false;
        if (transGameFilter === '100to1' && !(combined.includes('100') || combined.includes('сто'))) return false;
        if (transGameFilter === 'whatwherewhen' && !(combined.includes('что? где?') || combined.includes('чтогде') || combined.includes('чгк') || combined.includes('whatwherewhen'))) return false;
        if (transGameFilter === 'jeopardy' && !(combined.includes('своя игра') || combined.includes('своя икра') || combined.includes('jeopardy') || combined.includes('икра'))) return false;
        if (transGameFilter === 'melody' && !(combined.includes('мелоди') || combined.includes('melody') || combined.includes('угадай') || combined.includes('укавкай'))) return false;
        if (transGameFilter === 'other') {
          const isGame = combined.includes('блиц') || combined.includes('blitz') || combined.includes('миллионер') || combined.includes('millionaire') || combined.includes('квиллионер') || combined.includes('100') || combined.includes('сто') || combined.includes('что? где?') || combined.includes('чтогде') || combined.includes('чгк') || combined.includes('своя игра') || combined.includes('своя икра') || combined.includes('мелоди');
          if (isGame) return false;
        }
      }

      if (transSearch) {
        const q = transSearch.toLowerCase();
        const desc = (t.description || '').toLowerCase();
        const type = (t.type || '').toLowerCase();
        const ref = (t.reference_id || '').toLowerCase();
        if (!desc.includes(q) && !type.includes(q) && !ref.includes(q)) return false;
      }

      return true;
    });
  }, [transactions, transTypeFilter, transGameFilter, transSearch]);

  const TRANS_PER_PAGE = 50;
  const totalTransPages = Math.max(1, Math.ceil(filteredTransactions.length / TRANS_PER_PAGE));
  const currentTransPage = Math.min(transPage, totalTransPages);
  const paginatedTransactions = useMemo(() => {
    const start = (currentTransPage - 1) * TRANS_PER_PAGE;
    return filteredTransactions.slice(start, start + TRANS_PER_PAGE);
  }, [filteredTransactions, currentTransPage]);

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[65vh] gap-6 px-4 text-center">
        <div className="w-full max-w-lg rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-6 sm:p-8 space-y-5 shadow-2xl">
          <UserAvatar avatarUrl={DIRECT_MEDIA_URLS.MINI_LOGO} displayName="Демо игрок" size="xl" className="mx-auto" />
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-primary">Демо-режим Квайз</h2>
            <p className="text-sm text-foreground/80">
              Вы находитесь в ознакомительном демо-режиме без регистрации.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <BubbleElement isBadge active size="md" className="text-sm font-bold">
              Демо ID: {effectiveUid}
            </BubbleElement>
            <BubbleElement isBadge size="md" className="text-sm font-bold text-primary">
              На счету: {effectiveBalance} ИИкр
            </BubbleElement>
          </div>
          <p className="text-sm text-foreground/75">
            Войдите или зарегистрируйтесь по почте или через Telegram, чтобы получить +300 ИИкр и сохранить прогресс:
          </p>
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => openAuthModal('register')}
              className="flex-1 justify-center text-sm font-bold"
            >
              Регистрация (+300 ИИкр)
            </LeafButton>
            <LeafButton
              variant="glass"
              size="md"
              onClick={() => openAuthModal('login')}
              className="flex-1 justify-center text-sm font-bold"
            >
              Войти в аккаунт
            </LeafButton>
          </div>
        </div>
      </div>
    );
  }

  const isTelegramActive = Boolean(
    profile.telegram_photo &&
      (profile.avatar_source === 'telegram' || (!profile.avatar_url && !editAvatarUrl))
  );
  const isCustomActive = Boolean((editAvatarUrl || profile.avatar_url) && !isTelegramActive);

  return (
    <div className="space-y-4 sm:space-y-6 w-full max-w-none pb-12 text-sm min-w-0 overflow-x-hidden">
      {/* Profile Header Card with Liquid Glass Apple Styling */}
      <header className="relative overflow-hidden rounded-3xl sm:rounded-[2rem] border border-primary/20 bg-transparent backdrop-blur-2xl p-3.5 sm:p-8 text-left shadow-[0_8px_32px_rgba(0,0,0,0.3)] min-w-0">
        <div className="absolute top-0 right-0 w-72 h-72 bg-primary/15 blur-[90px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        {/* Mobile Compact Profile Header (md:hidden) */}
        <div className="relative z-10 md:hidden space-y-2.5 min-w-0">
          {/* Row 1: Avatar + Name, Username, Role + Menu Icon Button */}
          <div className="flex items-start justify-between gap-2.5 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div
                onClick={() => {
                  setTab('profile');
                  navigate('/profile');
                }}
                className="relative group shrink-0 cursor-pointer"
                title="Перейти в профиль"
              >
                <div className="absolute inset-0 bg-primary/25 blur-lg rounded-full pointer-events-none" />
                <UserAvatar
                  avatarUrl={
                    isTelegramActive
                      ? profile.telegram_photo
                      : (profile.avatar_url || profile.photo_url || profile.telegram_photo)
                  }
                  displayName={profile.display_name}
                  size="md"
                  className="relative w-12 h-12 border-2 border-primary/40 shadow-lg"
                />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-base font-black text-foreground leading-tight break-words drop-shadow-[0_0_8px_rgba(153,208,55,0.35)]">
                  {profile.display_name}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-1 min-w-0">
                  {profile.username && (
                    <span className="text-sm font-medium text-primary truncate max-w-[140px]">
                      {profile.username}
                    </span>
                  )}
                  <BubbleElement
                    size="sm"
                    isBadge
                    className="!px-2 !py-0.5 !text-sm border-primary/35 text-primary shrink-0"
                  >
                    {String(profile.uid) === '10016926299'
                      ? 'Супер-админ'
                      : profile.role === 'author'
                      ? 'Автор игр'
                      : 'Игрок'}
                  </BubbleElement>
                </div>
              </div>
            </div>

            {/* Menu Icon Button */}
            <div className="relative shrink-0">
              <BubbleElement
                size="sm"
                active={isMobileMenuOpenState}
                onClick={() => window.dispatchEvent(new CustomEvent('toggle-profile-menu'))}
                icon={isMobileMenuOpenState ? <X size={18} /> : <Menu size={18} />}
                className="p-2.5"
                title="Меню разделов личного кабинета"
              />
              {(unreadNotificationsCount + unreadFriendsMessagesCount) > 0 && !isMobileMenuOpenState && (
                <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-black text-background shadow-[0_0_8px_rgba(153,208,55,0.8)]">
                  {unreadNotificationsCount + unreadFriendsMessagesCount}
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Compact UID, TG ID, Email Badges */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <BubbleElement
              size="sm"
              onClick={() => copyToClipboard(profile.uid, setCopiedUid)}
              className="!px-2.5 !py-1 !text-sm"
              title="Нажмите, чтобы скопировать UID"
            >
              <span className="text-foreground/60">UID:</span>
              <span className="font-mono font-bold text-primary ml-1">{profile.uid}</span>
              {copiedUid ? (
                <Check size={14} className="text-primary ml-1 shrink-0 inline" />
              ) : (
                <Copy size={14} className="text-foreground/50 ml-1 shrink-0 inline" />
              )}
            </BubbleElement>

            <BubbleElement
              size="sm"
              isBadge
              icon={<Send size={13} className="shrink-0" />}
              className={`!px-2.5 !py-1 !text-sm ${
                profile.telegram_id
                  ? 'border-blue-500/35 text-blue-400'
                  : 'border-primary/20 text-foreground/50'
              }`}
            >
              <span>{profile.telegram_id ? `TG ID: ${profile.telegram_id}` : 'TG не привязан'}</span>
            </BubbleElement>

            <BubbleElement
              size="sm"
              isBadge
              icon={<Mail size={13} className="shrink-0" />}
              className={`!px-2.5 !py-1 !text-sm max-w-full overflow-hidden ${
                profile.email
                  ? 'border-primary/35 text-primary'
                  : 'border-primary/20 text-foreground/50'
              }`}
            >
              <span className="truncate max-w-[210px] inline-block align-bottom">
                {profile.email || 'Email не привязан'}
              </span>
            </BubbleElement>
          </div>

          {/* Row 2.5: Minimalist Balance of IIkr & Balance of Points (Click opens /profile/exchange) */}
          <div className="grid grid-cols-2 gap-2 min-w-0">
            <BubbleElement
              size="sm"
              onClick={() => {
                setTab('exchange');
                navigate('/profile/exchange');
              }}
              className="w-full justify-between !px-3 !py-1.5 !text-sm rounded-2xl border-primary/35"
              title="Перейти в магазин ИИкры"
            >
              <span className="flex items-center justify-between w-full gap-1.5 min-w-0">
                <span className="text-foreground/75 font-semibold truncate">ИИкры:</span>
                <span className="font-black text-primary flex items-center gap-1 shrink-0">
                  {profile.balance ?? 0}
                  <BubbleCurrencyIcon className="w-4 h-4 shrink-0" />
                </span>
              </span>
            </BubbleElement>

            <BubbleElement
              size="sm"
              onClick={() => {
                setTab('exchange');
                navigate('/profile/exchange');
              }}
              className="w-full justify-between !px-3 !py-1.5 !text-sm rounded-2xl border-amber-500/35"
              title="Перейти в магазин и обмен очков"
            >
              <span className="flex items-center justify-between w-full gap-1.5 min-w-0">
                <span className="text-foreground/75 font-semibold truncate">Очки:</span>
                <span className="font-black text-amber-400 flex items-center gap-1 shrink-0">
                  {(profile.total_points ?? profile.points ?? 0).toLocaleString('ru-RU')}
                  <Coins size={14} className="text-amber-400 shrink-0" />
                </span>
              </span>
            </BubbleElement>
          </div>

          {/* Row 3: Compact Actions (Admin Panel, Logout) + Expand/Collapse Stats Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-primary/15 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              {String(profile.uid) === '10016926299' && (
                <Link to="/system-admin">
                  <LeafButton
                    variant="glass"
                    size="sm"
                    icon={<ShieldCheck size={15} />}
                    className="!px-2.5 !py-1 !text-sm"
                  >
                    Админ-панель
                  </LeafButton>
                </Link>
              )}
              {!pwaInstall.isInstalled && (
                <LeafButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => pwaInstall.triggerInstall()}
                  icon={<Download size={15} />}
                  className="!px-2.5 !py-1 !text-sm"
                  title="Установить приложение на рабочий стол Android или iPhone"
                >
                  Установить
                </LeafButton>
              )}
              <BubbleElement
                size="sm"
                onClick={logout}
                icon={<LogOut size={14} />}
                className="!px-2.5 !py-1 !text-sm border-destructive/35 text-destructive"
              >
                Выйти
              </BubbleElement>
            </div>

            <BubbleElement
              size="sm"
              active={isMobileStatsOpen}
              onClick={() => setIsMobileStatsOpen((prev) => !prev)}
              icon={isMobileStatsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              className="!px-3 !py-1 !text-sm ml-auto"
            >
              <span>{isMobileStatsOpen ? 'Свернуть блоки' : 'Баланс и блоки'}</span>
            </BubbleElement>
          </div>
        </div>

        {/* Desktop Profile Header (hidden md:flex) */}
        <div className="relative z-10 hidden md:flex flex-row items-center gap-6">
          <div 
            onClick={() => {
              setTab('profile');
              navigate('/profile');
            }}
            className="relative group shrink-0 cursor-pointer"
            title="Перейти в профиль"
          >
            <div className="absolute inset-0 bg-primary/30 blur-xl rounded-full group-hover:bg-primary/50 transition-colors" />
            <UserAvatar
              avatarUrl={
                isTelegramActive
                  ? profile.telegram_photo
                  : (profile.avatar_url || profile.photo_url || profile.telegram_photo)
              }
              displayName={profile.display_name}
              size="xl"
              className="relative border-4 border-background group-hover:scale-105 transition-transform shadow-2xl"
            />
          </div>

          <div className="flex-1 w-full">
            <div className="flex flex-row items-center justify-between gap-3">
              <div>
                <h2 className="text-3xl font-black text-foreground drop-shadow-[0_0_8px_rgba(153,208,55,0.4)]">
                  {profile.display_name}
                </h2>
                {profile.username && (
                  <p className="text-sm font-medium text-primary mt-0.5">{profile.username}</p>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <span className="rounded-full bg-transparent border border-primary/30 px-4 py-1.5 text-sm font-bold text-primary backdrop-blur-md shadow-sm">
                  {String(profile.uid) === '10016926299' ? 'Супер-администратор' : profile.role === 'author' ? 'Автор игр' : 'Игрок'}
                </span>
              </div>
            </div>

            {/* Badges: UID, Telegram, Email */}
            <div className="mt-4 flex flex-wrap items-center justify-start gap-2.5">
              {/* Canonical 11-digit UID Badge */}
              <div 
                onClick={() => copyToClipboard(profile.uid, setCopiedUid)}
                className="flex items-center gap-2 rounded-xl bg-transparent backdrop-blur-md border border-primary/25 px-3 py-1.5 cursor-pointer hover:border-primary/50 transition-all shadow-sm group"
                title="Нажмите, чтобы скопировать UID"
              >
                <span className="text-sm font-bold text-foreground/50">UID:</span>
                <span className="text-sm font-mono font-bold text-primary">{profile.uid}</span>
                {copiedUid ? <Check size={16} className="text-primary" /> : <Copy size={16} className="text-foreground/40 group-hover:text-primary transition-colors" />}
              </div>

              {/* Telegram Badge */}
              {profile.telegram_id ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-transparent backdrop-blur-md border border-blue-500/25 px-3 py-1.5 text-sm font-medium text-blue-400">
                  <Send size={16} />
                  <span>TG ID: {profile.telegram_id}</span>
                </div>
              ) : (
                <span className="rounded-xl bg-transparent border border-foreground/10 px-3 py-1.5 text-sm text-foreground/50">
                  Telegram не привязан
                </span>
              )}

              {/* Email Badge */}
              {profile.email ? (
                <div className="flex items-center gap-1.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/25 px-3 py-1.5 text-sm font-medium text-primary">
                  <Mail size={16} />
                  <span>{profile.email}</span>
                </div>
              ) : (
                <span className="rounded-xl bg-transparent border border-foreground/10 px-3 py-1.5 text-sm text-foreground/50">
                  Email не привязан
                </span>
              )}
            </div>

            {/* Actions: Admin Panel Button & Logout */}
            <div className="mt-5 flex flex-wrap items-center justify-start gap-3">
              {String(profile.uid) === '10016926299' && (
                <Link to="/system-admin">
                  <LeafButton
                    variant="glass"
                    size="sm"
                    icon={<ShieldCheck size={18} />}
                  >
                    Админ-панель
                  </LeafButton>
                </Link>
              )}
              {!pwaInstall.isInstalled && (
                <LeafButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => pwaInstall.triggerInstall()}
                  icon={<Download size={17} />}
                  title="Установить приложение на экран устройства Android или iPhone"
                >
                  Установить приложение
                </LeafButton>
              )}
              <BubbleElement
                size="md"
                onClick={logout}
                icon={<LogOut size={16} />}
                className="border-destructive/30 text-destructive"
              >
                Выйти
              </BubbleElement>
            </div>
          </div>
        </div>
      </header>

      {/* Top Stat Cards with Liquid Glass (Collapsible on mobile, always visible on desktop) */}
      <div className={`${isMobileStatsOpen ? 'grid' : 'hidden'} md:grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`}>
        <Link to="/profile/trans" className="block transition-transform hover:scale-[1.02]">
          <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-3.5 sm:p-4 shadow-sm space-y-1.5 h-full">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/70">Баланс ИИкры</span>
              <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
                <Wallet size={20} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-primary">{profile.balance ?? 0}</span>
              <span className="text-sm font-bold text-foreground/80">{getIikrWord(profile.balance ?? 0)}</span>
              <BubbleCurrencyIcon className="w-5 h-5" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 text-sm">
              <BubbleElement size="sm" isBadge className="!text-sm border-emerald-500/30 text-emerald-400">
                Оплаченный: {profile.balance_pay ?? 0}
              </BubbleElement>
              <BubbleElement size="sm" isBadge className="!text-sm border-blue-500/30 text-blue-400">
                Бесплатный: {profile.balance_free ?? 0}
              </BubbleElement>
              <BubbleElement size="sm" isBadge className="!text-sm border-purple-500/30 text-purple-300">
                Подарки: {profile.balance_gift ?? 0}
              </BubbleElement>
              {Number(profile.balance_out ?? 0) > 0 && (
                <BubbleElement size="sm" isBadge className="!text-sm border-rose-500/30 text-rose-300">
                  Расход/подарки: -{profile.balance_out}
                </BubbleElement>
              )}
              <BubbleElement size="sm" isBadge className="!text-sm border-amber-500/30 text-amber-400">
                Из очков: {profile.ballance_point ?? profile.balance_point ?? 0}
              </BubbleElement>
            </div>
          </div>
        </Link>

        {/* Game Points and Exchange Card */}
        <div 
          onClick={() => setTab('exchange')} 
          className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-3.5 sm:p-4 shadow-sm cursor-pointer hover:border-primary/40 transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/70">Игровые очки</span>
              <div className="p-2 rounded-xl bg-transparent border border-amber-500/30 text-amber-400">
                <Coins size={20} />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-black text-foreground">
                {(profile.total_points ?? profile.points ?? 0).toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-primary/10 mt-2">
            <span className="text-sm text-primary font-bold">
              = {Math.floor((profile.total_points ?? profile.points ?? 0) / 10000)} ИИкр
            </span>
            <BubbleElement size="sm" isBadge className="!text-sm">
              Магазин
            </BubbleElement>
          </div>
        </div>

        <div 
          onClick={() => setTab('ref')} 
          className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-3.5 sm:p-4 shadow-sm cursor-pointer hover:border-primary/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/70">Партнерка</span>
            <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
              <Share2 size={20} />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-2xl font-black text-foreground">{referralData?.referral_count || 0}</span>
            <span className="text-sm font-semibold text-primary flex items-center gap-1">
              (+{referralData?.referral_earnings || 0} {getIikrWord(referralData?.referral_earnings || 0)} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />)
            </span>
          </div>
        </div>

        <div 
          onClick={() => setTab('history')} 
          className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-3.5 sm:p-4 shadow-sm cursor-pointer hover:border-primary/40 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground/70">Побед в играх</span>
            <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
              <Trophy size={20} />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-foreground">{gameStats.wins}</span>
          </div>
        </div>

        <div 
          onClick={() => setTab('notifications')} 
          className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-3.5 sm:p-4 shadow-sm cursor-pointer hover:border-primary/40 transition-all relative overflow-hidden flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground/70">Уведомления</span>
              <div className="p-2 rounded-xl bg-transparent border border-primary/25 text-primary">
                <Bell size={20} />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-foreground">
                {totalNotificationsCount}
              </span>
              <span className="text-sm font-bold text-foreground/60">
                всего
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-primary/10 mt-2 text-sm">
            <span className="text-emerald-400 font-semibold">
              Прочитано: {readNotificationsCount}
            </span>
            <span className={`font-bold ${unreadNotificationsCount > 0 ? 'text-amber-400' : 'text-foreground/50'}`}>
              Новых: {unreadNotificationsCount}
            </span>
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <div className="rounded-[2rem] border border-primary/20 bg-transparent backdrop-blur-2xl overflow-hidden shadow-xl">
        {/* Navigation Tabs Header - Hidden on mobile (replaced by Menu icon), visible on Desktop */}
        <div className="hidden md:flex flex-wrap items-center border-b border-primary/20 bg-transparent backdrop-blur-2xl p-2.5 sm:p-3.5 gap-2">
          <LeafButton
            active={activeTab === 'profile'}
            variant={activeTab === 'profile' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('profile')}
            icon={<UserIcon size={18} />}
            title="Настройки личного профиля и аватарки"
          >
            Профиль
          </LeafButton>

          <LeafButton
            active={activeTab === 'exchange'}
            variant={activeTab === 'exchange' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('exchange')}
            icon={<ShoppingBag size={18} />}
            title="Магазин игр и обмен очков"
          >
            Магазин
          </LeafButton>

          <LeafButton
            active={activeTab === 'trans'}
            variant={activeTab === 'trans' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('trans')}
            icon={<Wallet size={18} />}
            title="История финансовых транзакций и баланса"
          >
            Транзакции {transactions.length > 0 ? `(${transactions.length})` : ''}
          </LeafButton>

          <LeafButton
            active={activeTab === 'notifications'}
            variant={activeTab === 'notifications' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('notifications')}
            icon={<Bell size={18} />}
            title="Системные оповещения и уведомления"
          >
            Уведомления {unreadNotificationsCount > 0 ? `(${unreadNotificationsCount})` : ''}
          </LeafButton>

          <LeafButton
            active={activeTab === 'ref'}
            variant={activeTab === 'ref' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('ref')}
            icon={<Users size={18} />}
            title="Друзья, пользователи и сообщения"
          >
            <span className="flex items-center gap-1.5">
              <span>Друзья</span>
              {unreadFriendsMessagesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[11px] font-bold bg-primary text-background shadow-[0_0_10px_rgba(202,253,0,0.6)]">
                  +{unreadFriendsMessagesCount}
                </span>
              )}
            </span>
          </LeafButton>

          <LeafButton
            active={activeTab === 'history'}
            variant={activeTab === 'history' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('history')}
            icon={<History size={18} />}
            title="Архив сыгранных партий, статистика и сохраненные пакеты"
          >
            История игр
          </LeafButton>

          <LeafButton
            active={activeTab === 'multiplayer'}
            variant={activeTab === 'multiplayer' ? 'primary' : 'glass'}
            size="sm"
            onClick={() => setTab('multiplayer')}
            icon={<Users size={18} />}
            title="Мультиплеерные лобби и видеокомнаты"
          >
            Мультиплеер
          </LeafButton>
        </div>

        {/* Tab Content Body */}
        <div className="px-3 py-5 sm:p-8 min-w-0 overflow-hidden">
          {/* ========================================================================= */}
          {/* 1. PROFILE EDITOR TAB */}
          {/* ========================================================================= */}
          {activeTab === 'profile' && (
            <div className="space-y-6 sm:space-y-8 min-w-0">
              {saveProfileMsg && (
                <div className={`p-4 rounded-2xl text-sm font-medium flex items-center gap-3 bg-transparent backdrop-blur-xl ${
                  saveProfileMsg.type === 'success' 
                    ? 'text-emerald-400 border border-emerald-500/30' 
                    : 'text-destructive border border-destructive/30'
                }`}>
                  {saveProfileMsg.type === 'success' ? <CheckCircle2 size={18} className="shrink-0" /> : <AlertCircle size={18} className="shrink-0" />}
                  <span className="min-w-0 break-words">{saveProfileMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-6 min-w-0">
                <div className="grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 min-w-0">
                  <div className="space-y-1.5 min-w-0">
                    <label className="text-sm font-bold text-foreground/80 block">
                      Отображаемое имя (Никнейм) <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ваше имя в игре"
                      value={editDisplayName}
                      onChange={(e) => setEditDisplayName(e.target.value)}
                      className="w-full p-3.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-sm font-bold text-foreground/80 block">
                      Имя пользователя (@username)
                    </label>
                    <input
                      type="text"
                      placeholder="@username"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      className="w-full p-3.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary transition-colors font-mono"
                    />
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-sm font-bold text-foreground/80 block">
                      Имя телеграм
                    </label>
                    <input
                      type="text"
                      placeholder="Имя из Telegram"
                      value={editFirstName}
                      onChange={(e) => setEditFirstName(e.target.value)}
                      className="w-full p-3.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-sm font-bold text-foreground/80 block">
                      Фамилия телеграм
                    </label>
                    <input
                      type="text"
                      placeholder="Фамилия из Telegram"
                      value={editLastName}
                      onChange={(e) => setEditLastName(e.target.value)}
                      className="w-full p-3.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {/* ===================================================================== */}
                {/* Advanced Multi-Column Avatar Management Section */}
                {/* ===================================================================== */}
                <div className="p-3.5 sm:p-6 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-4 sm:space-y-5 w-full min-w-0 overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Camera size={18} className="text-primary shrink-0" />
                        <span className="break-words">Управление фотографиями профиля</span>
                      </span>
                      <p className="text-sm text-foreground/70 mt-1 leading-relaxed break-words">
                        Приоритет — загруженная фотография. Вы можете в любой момент переключаться между загруженным фото и фотографией из Telegram.
                      </p>
                    </div>
                  </div>

                  {/* Dual Card Avatar Selector Grid */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 w-full min-w-0">
                    {/* Option 1: Telegram Photo Card */}
                    <div className={`p-3.5 sm:p-4 rounded-2xl border bg-transparent backdrop-blur-md transition-all flex flex-col justify-between w-full min-w-0 overflow-hidden ${
                      isTelegramActive 
                        ? 'border-primary shadow-[0_0_15px_rgba(153,208,55,0.15)]' 
                        : 'border-primary/20 hover:border-primary/40'
                    }`}>
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <span className="text-sm font-bold text-foreground flex items-center gap-1.5 min-w-0">
                            <Send size={15} className="text-blue-400 shrink-0" />
                            <span className="break-words">Фото из Telegram</span>
                          </span>
                          {isTelegramActive && (
                            <BubbleElement isBadge active size="sm" className="shrink-0" icon={<Check size={13} className="text-black" />}>
                              Активно
                            </BubbleElement>
                          )}
                        </div>

                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            avatarUrl={profile.telegram_photo}
                            displayName={profile.display_name}
                            size="lg"
                            className="border border-primary/30 shrink-0"
                          />
                          <div className="min-w-0 flex-1 text-sm text-foreground/75">
                            {profile.telegram_photo ? (
                              <p className="break-words leading-snug text-foreground/90 font-medium">
                                Синхронизировано с Telegram аккаунтом
                              </p>
                            ) : (
                              <p className="break-words leading-snug text-foreground/60">
                                Фотография в Telegram не найдена или не привязана
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-primary/15 w-full min-w-0">
                        {profile.telegram_photo ? (
                          <LeafButton
                            type="button"
                            variant={isTelegramActive ? 'glass' : 'primary'}
                            size="sm"
                            onClick={() => handleQuickSwitchAvatar('telegram')}
                            disabled={isTelegramActive}
                            className="w-full max-w-full justify-center text-sm font-bold px-3"
                          >
                            {isTelegramActive ? 'Выбрано активным' : 'Установить фото из Telegram'}
                          </LeafButton>
                        ) : (
                          <span className="text-sm text-foreground/50 block text-center py-1 break-words">
                            Подключите Telegram для авто-загрузки фото
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Option 2: Custom Uploaded Avatar Card */}
                    <div className={`p-3.5 sm:p-4 rounded-2xl border bg-transparent backdrop-blur-md transition-all flex flex-col justify-between w-full min-w-0 overflow-hidden ${
                      isCustomActive 
                        ? 'border-primary shadow-[0_0_15px_rgba(153,208,55,0.15)]' 
                        : 'border-primary/20 hover:border-primary/40'
                    }`}>
                      <div className="space-y-3 min-w-0">
                        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                          <span className="text-sm font-bold text-foreground flex items-center gap-1.5 min-w-0">
                            <ImageIcon size={15} className="text-primary shrink-0" />
                            <span className="break-words">Загруженное фото (приоритет)</span>
                          </span>
                          {isCustomActive && (
                            <BubbleElement isBadge active size="sm" className="shrink-0" icon={<Check size={13} className="text-black" />}>
                              Активно
                            </BubbleElement>
                          )}
                        </div>

                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            avatarUrl={editAvatarUrl || profile.avatar_url}
                            displayName={profile.display_name}
                            size="lg"
                            className="border border-primary/30 shrink-0"
                          />
                          <div className="min-w-0 flex-1 text-sm text-foreground/75">
                            {(editAvatarUrl || profile.avatar_url) ? (
                              <p className="break-words leading-snug text-foreground/90 font-medium">
                                Загружено пользователем
                              </p>
                            ) : (
                              <p className="break-words leading-snug text-foreground/60">
                                Аватарка пока не загружена
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-primary/15 space-y-2.5 w-full min-w-0">
                        {(editAvatarUrl || profile.avatar_url) ? (
                          <div className="flex items-center gap-2 w-full min-w-0">
                            <LeafButton
                              type="button"
                              variant={isCustomActive ? 'glass' : 'primary'}
                              size="sm"
                              onClick={() => handleQuickSwitchAvatar('custom')}
                              disabled={isCustomActive}
                              className="flex-1 min-w-0 max-w-full justify-center text-sm font-bold px-3"
                            >
                              {isCustomActive ? 'Выбрано активным' : 'Установить загруженное фото'}
                            </LeafButton>
                            <BubbleElement
                              size="sm"
                              onClick={handleRemoveCustomAvatar}
                              icon={<Trash2 size={16} className="text-destructive" />}
                              title="Удалить пользовательскую аватарку и вернуть фото из Telegram"
                              className="p-2 cursor-pointer shrink-0"
                            />
                          </div>
                        ) : null}

                        {/* Upload Controls */}
                        <div className="w-full min-w-0">
                          <label className={`w-full max-w-full min-w-0 cursor-pointer py-2.5 px-3 rounded-full border border-primary/45 bg-transparent backdrop-blur-xl text-sm font-bold text-primary hover:border-primary flex items-center justify-center gap-2 text-center shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_2px_rgba(255,255,255,0.2)] transition-all ${uploadingAvatar ? 'opacity-60 cursor-not-allowed' : ''}`}>
                            {uploadingAvatar ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Upload size={16} className="shrink-0" />}
                            <span className="min-w-0 break-words leading-tight">
                              {uploadingAvatar ? 'Загрузка...' : 'Загрузить фото с устройства'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={uploadingAvatar}
                              onChange={handleAvatarFileUpload}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Direct URL input */}
                  <div className="space-y-1.5 pt-1 min-w-0">
                    <span className="text-sm text-foreground/75 block break-words">Или введите прямую ссылку на фото:</span>
                    <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                      <input
                        type="url"
                        placeholder="https://example.com/avatar.jpg"
                        value={editAvatarUrl}
                        onChange={(e) => setEditAvatarUrl(e.target.value)}
                        className="w-full flex-1 min-w-0 p-3 rounded-xl bg-transparent backdrop-blur-md border border-primary/25 text-sm font-mono text-foreground focus:outline-none focus:border-primary"
                      />
                      {editAvatarUrl && (
                        <LeafButton
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={() => handleQuickSwitchAvatar('custom')}
                          className="w-full sm:w-auto justify-center text-sm font-bold shrink-0"
                        >
                          Применить
                        </LeafButton>
                      )}
                    </div>
                  </div>
                </div>

                {/* Save Profile Button */}
                <div className="flex justify-end pt-2 min-w-0">
                  <LeafButton
                    type="submit"
                    variant="primary"
                    size="md"
                    disabled={savingProfile}
                    icon={savingProfile ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3.5 text-sm font-bold justify-center"
                  >
                    Сохранить изменения профиля
                  </LeafButton>
                </div>
              </form>

              {/* Account Linking Block (Telegram & Email) */}
              <div className="pt-6 border-t border-primary/20 space-y-5 min-w-0">
                <div className="min-w-0">
                  <h4 className="text-base font-bold text-primary flex items-center gap-2">
                    <LinkIcon size={20} className="shrink-0" />
                    <span className="break-words">Привязка и объединение аккаунтов (Telegram и Email)</span>
                  </h4>
                  <p className="text-sm text-foreground/70 mt-1 break-words">
                    Синхронизируйте Telegram и Email с UID {profile.uid} для единого входа, объединения баланса ИИкр и сохранения истории игр.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 w-full min-w-0">
                  {/* Telegram status */}
                  <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3 w-full min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <span className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Send size={18} className="text-blue-400 shrink-0" />
                        <span>Telegram</span>
                      </span>
                      {profile.telegram_id ? (
                        <BubbleElement isBadge active size="sm" className="!text-sm flex items-center gap-1 shrink-0">
                          <CheckCircle2 size={15} />
                          Подключен
                        </BubbleElement>
                      ) : (
                        <BubbleElement isBadge size="sm" className="!text-sm text-foreground/60 shrink-0">
                          Не подключен
                        </BubbleElement>
                      )}
                    </div>

                    {profile.telegram_id ? (
                      <div className="text-sm text-foreground/75 space-y-1 font-mono break-words">
                        <p>ID: <span className="text-foreground font-bold">{profile.telegram_id}</span></p>
                        {profile.username && <p>Ник: <span className="text-primary">{profile.username}</span></p>}
                      </div>
                    ) : (
                      <div className="space-y-3 min-w-0">
                        <p className="text-sm text-foreground/70 break-words">
                          Привяжите ваш Telegram или объедините существующий аккаунт из мини-апп в один клик:
                        </p>
                        <div className="flex flex-col gap-2 w-full min-w-0">
                          {Boolean((window as any).Telegram?.WebApp?.initDataUnsafe?.user) && (
                            <LeafButton
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={handleInstantLinkTelegram}
                              disabled={linkLoading}
                              icon={<Send size={16} />}
                              className="w-full max-w-full justify-center !text-sm"
                            >
                              {linkLoading ? 'Синхронизация...' : 'Привязать текущий Telegram'}
                            </LeafButton>
                          )}
                          <a
                            href={`https://t.me/qaiz_aibot/app?startapp=link_${profile.uid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full min-w-0"
                          >
                            <LeafButton
                              type="button"
                              variant="primary"
                              size="sm"
                              icon={<Send size={16} className="rotate-[-45deg]" />}
                              className="w-full max-w-full justify-center !text-sm"
                            >
                              Открыть и привязать в Telegram
                            </LeafButton>
                          </a>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Email status */}
                  <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-4 sm:p-5 space-y-3 w-full min-w-0 overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                      <span className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Mail size={18} className="text-primary shrink-0" />
                        <span>Email почта</span>
                      </span>
                      {profile.email ? (
                        <BubbleElement isBadge active size="sm" className="!text-sm flex items-center gap-1 shrink-0">
                          <CheckCircle2 size={15} />
                          Подключен
                        </BubbleElement>
                      ) : (
                        <BubbleElement isBadge size="sm" className="!text-sm text-foreground/60 shrink-0">
                          Не подключен
                        </BubbleElement>
                      )}
                    </div>

                    {profile.email ? (
                      <div className="text-sm text-foreground/75 space-y-3 min-w-0">
                        <p className="break-all">Email: <span className="font-bold text-foreground">{profile.email}</span></p>
                        <LeafButton
                          type="button"
                          variant="glass"
                          size="sm"
                          onClick={() => setShowPasswordModal(true)}
                          icon={<KeyRound size={15} />}
                          className="!text-sm w-full sm:w-auto justify-center"
                        >
                          Изменить пароль
                        </LeafButton>
                      </div>
                    ) : (
                      <form onSubmit={handleLinkEmail} className="space-y-3 min-w-0">
                        <p className="text-sm text-foreground/70 break-words">
                          Укажите email и пароль для привязки (если у вас уже есть аккаунт по почте — введите его данные для объединения аккаунтов):
                        </p>
                        <input
                          type="email"
                          required
                          placeholder="your-email@example.com"
                          value={linkEmail}
                          onChange={(e) => setLinkEmail(e.target.value)}
                          className="w-full rounded-xl bg-transparent backdrop-blur-md border border-primary/25 p-3 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                        <input
                          type="password"
                          required
                          placeholder="Пароль для входа (от 6 символов)"
                          value={linkPassword}
                          onChange={(e) => setLinkPassword(e.target.value)}
                          className="w-full rounded-xl bg-transparent backdrop-blur-md border border-primary/25 p-3 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                        {linkMessage && (
                          <div className={`p-3 rounded-xl text-sm font-medium bg-transparent backdrop-blur-md break-words ${
                            linkMessage.type === 'success' 
                              ? 'border border-emerald-500/30 text-emerald-400' 
                              : 'border border-destructive/30 text-destructive'
                          }`}>
                            {linkMessage.text}
                          </div>
                        )}
                        <LeafButton
                          type="submit"
                          variant="primary"
                          size="sm"
                          disabled={linkLoading}
                          className="w-full max-w-full justify-center !text-sm"
                        >
                          {linkLoading ? <Loader2 size={16} className="animate-spin" /> : 'Привязать и объединить Email'}
                        </LeafButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>

              {/* PWA Install & Mobile Device Push Settings Card */}
              <div className="pt-6 border-t border-primary/20 min-w-0">
                <PWAInstallAndPushCard
                  userId={profile.uid}
                  onOpenNotificationSettings={() => setShowProfileNotifSettings(true)}
                />
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 1.5. EXCHANGE & STORE TAB (/profile/exchange) */}
          {/* ========================================================================= */}
          {activeTab === 'exchange' && (
            <div className="space-y-8">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                    <Wallet size={24} className="text-primary" />
                    Пополнение баланса и обмен очков
                  </h3>
                  <p className="text-sm text-foreground/70 mt-1">
                    Пополняйте баланс ИИкры за рубли со скидкой до 25% и обменивайте заработанные игровые очки на ИИкру по курсу 10 000 очков = 1 ИИкра.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <LeafButton
                    variant="glass"
                    size="sm"
                    onClick={() => {
                      refetchProfile();
                      fetchTransactions();
                    }}
                    icon={<RefreshCcw size={16} />}
                  >
                    Обновить данные
                  </LeafButton>
                </div>
              </div>

              {/* Free games banner */}
              <div className="p-5 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.37)] overflow-hidden">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl flex items-center justify-center text-primary shrink-0 shadow-[0_0_15px_rgba(153,208,55,0.3)]">
                    <Gamepad2 size={24} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h4 className="text-base font-bold text-foreground leading-snug break-words">
                      Хотите играть без списания ИИкры?
                    </h4>
                    <div>
                      <BubbleElement isBadge active size="sm">Freeлионер</BubbleElement>
                    </div>
                  </div>
                </div>
                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={() => navigate('/free')}
                  icon={<Gamepad2 size={16} />}
                  className="w-full sm:w-auto justify-center shrink-0 text-sm font-bold"
                >
                  Перейти к бесплатным играм
                </LeafButton>
              </div>

              {topUpFeedback && (
                <div className={`p-4 rounded-2xl text-sm font-medium flex items-center gap-3 backdrop-blur-md ${
                  topUpFeedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-destructive/10 text-destructive border border-destructive/30'
                }`}>
                  {topUpFeedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span>{topUpFeedback.text}</span>
                </div>
              )}

              {exchangeFeedback && (
                <div className={`p-4 rounded-2xl text-sm font-medium flex items-center gap-3 backdrop-blur-md ${
                  exchangeFeedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-destructive/10 text-destructive border border-destructive/30'
                }`}>
                  {exchangeFeedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span>{exchangeFeedback.text}</span>
                </div>
              )}

              {shopFeedback && (
                <div className={`p-4 rounded-2xl text-sm font-medium flex items-center gap-3 backdrop-blur-md ${
                  shopFeedback.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'bg-destructive/10 text-destructive border border-destructive/30'
                }`}>
                  {shopFeedback.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                  <span>{shopFeedback.text}</span>
                </div>
              )}

              {/* 1. Ruble Top-Up Section (FIRST) with tiered discounts */}
              {(() => {
                const currentAmount = Math.max(1, Number(exchangeTopUpAmount) || 0);
                const pricing = calculateTopUpPriceRub(currentAmount);

                return (
                  <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 sm:p-8 space-y-6 overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md text-primary shadow-sm">
                          <CreditCard size={24} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <h4 className="text-lg font-bold text-foreground leading-snug break-words">
                            Пополнение баланса ИИкры
                          </h4>
                          <div>
                            <BubbleElement isBadge size="sm" className="!text-sm max-w-full">
                              1 ИИкра = 0.99 рубля
                            </BubbleElement>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tiered discounts progress bar */}
                    <div className="space-y-2">
                      <div className="flex flex-col items-start sm:flex-row sm:items-center justify-between gap-2 text-sm">
                        <span className="font-bold text-foreground/80">
                          Шкала скидок за разовое пополнение:
                        </span>
                        {pricing.discountPercent > 0 && (
                          <BubbleElement isBadge size="sm" className="!text-sm !text-primary border-primary/40 font-mono">
                            Ваша скидка: {pricing.discountPercent}%
                          </BubbleElement>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                        {TOP_UP_DISCOUNT_TIERS.map((tier, idx) => {
                          const isActiveTier = pricing.discountPercent === tier.percent && currentAmount >= tier.min;
                          return (
                            <div
                              key={`tier-${idx}`}
                              className={`p-3 rounded-2xl border text-center transition-all backdrop-blur-md ${
                                isActiveTier
                                  ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(153,208,55,0.25)]'
                                  : 'border-primary/20 bg-transparent'
                              }`}
                            >
                              <p className="text-sm font-mono text-foreground/70">
                                {tier.range}
                              </p>
                              <p className={`text-sm font-bold font-mono mt-1 ${isActiveTier ? 'text-primary' : 'text-foreground'}`}>
                                {tier.percent === 0 ? 'Без скидки' : `Скидка ${tier.percent}%`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Left Column: Calculator & Presets */}
                      <div className="lg:col-span-2 space-y-5">
                        <div className="space-y-2">
                          <label className="text-sm font-bold text-foreground/80 block">
                            Количество ИИкры для пополнения
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min="1"
                              value={exchangeTopUpAmount || ''}
                              onChange={(e) => setExchangeTopUpAmount(Math.max(1, Number(e.target.value)))}
                              placeholder="Например, 500"
                              className="w-full rounded-2xl border border-primary/25 bg-transparent p-3.5 pr-28 text-base font-mono font-bold text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                            />
                            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                              <BubbleElement isBadge size="sm" className="!text-sm">
                                <BubbleCurrencyIcon className="w-3.5 h-3.5 inline mr-1" />
                                {getIikrWord(exchangeTopUpAmount || 1)}
                              </BubbleElement>
                            </div>
                          </div>
                        </div>

                        {/* Quick Presets with discounts */}
                        <div className="space-y-2">
                          <span className="text-sm font-bold text-foreground/70 block">
                            Быстрые пакеты пополнения:
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                            {TOP_UP_PRESET_PACKS.map((pack) => {
                              const isSelected = exchangeTopUpAmount === pack.iikr;
                              return (
                                <button
                                  key={`pack-${pack.iikr}`}
                                  type="button"
                                  onClick={() => setExchangeTopUpAmount(pack.iikr)}
                                  className={`p-3.5 rounded-2xl border text-left transition-all backdrop-blur-md relative overflow-hidden ${
                                    isSelected
                                      ? 'border-primary bg-primary/10 text-foreground shadow-[0_0_15px_rgba(153,208,55,0.25)]'
                                      : 'border-primary/20 bg-transparent text-foreground/80 hover:border-primary/40'
                                  }`}
                                >
                                  {pack.discountPercent > 0 && (
                                    <div className="absolute top-2 right-2">
                                      <BubbleElement isBadge size="sm" className="!text-sm !py-0.5 !px-1.5 !text-primary border-primary/40">
                                        -{pack.discountPercent}%
                                      </BubbleElement>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1 font-mono font-bold text-base text-primary">
                                    <span>{pack.iikr.toLocaleString('ru-RU')}</span>
                                    <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                                  </div>
                                  <div className="mt-1 flex items-baseline gap-1.5">
                                    <span className="text-sm font-bold text-foreground font-mono">
                                      {pack.finalPriceRub.toFixed(2)} ₽
                                    </span>
                                    {pack.discountPercent > 0 && (
                                      <span className="text-sm line-through text-foreground/50 font-mono">
                                        {pack.basePriceRub.toFixed(2)} ₽
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-foreground/60 mt-0.5">
                                    {getIikrWord(pack.iikr)}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Payment methods (Cards only, SBP text removed) */}
                        <div className="space-y-2 pt-1">
                          <span className="text-sm font-bold text-foreground/70 block">Способ оплаты:</span>
                          <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-primary/30 bg-primary/10 backdrop-blur-md max-w-sm">
                            <CreditCard className="text-primary shrink-0" size={22} />
                            <div>
                              <p className="font-bold text-sm text-foreground">Банковская карта РФ</p>
                              <p className="text-sm text-foreground/60">МИР, Visa, Mastercard</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Order Summary with Discounts */}
                      <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md p-5 space-y-4 shadow-md flex flex-col justify-between">
                        <div className="space-y-3 text-sm">
                          <h5 className="font-bold text-foreground text-sm border-b border-primary/10 pb-2">
                            Детали пополнения
                          </h5>
                          <div className="flex justify-between">
                            <span className="text-foreground/70">Текущий баланс:</span>
                            <span className="font-bold text-foreground font-mono flex items-center gap-1">
                              {formatIikr(profile.balance || 0)} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-foreground/70">К зачислению:</span>
                            <span className="font-bold text-primary font-mono flex items-center gap-1">
                              +{formatIikr(currentAmount)} <BubbleCurrencyIcon className="w-3.5 h-3.5 inline" />
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-foreground/70">Баланс после пополнения:</span>
                            <span className="font-bold text-foreground font-mono">
                              {formatIikr((profile.balance || 0) + currentAmount)}
                            </span>
                          </div>
                          <div className="h-px bg-primary/10 my-2" />
                          <div className="flex justify-between">
                            <span className="text-foreground/70">Базовая стоимость:</span>
                            <span className="font-bold text-foreground font-mono">
                              {pricing.basePriceRub.toFixed(2)} ₽
                            </span>
                          </div>
                          {pricing.discountPercent > 0 && (
                            <div className="flex justify-between text-primary font-medium">
                              <span>Скидка {pricing.discountPercent}%:</span>
                              <span className="font-mono font-bold">
                                -{pricing.discountRub.toFixed(2)} ₽
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between items-end pt-2 border-t border-primary/10">
                            <span className="font-bold text-foreground/80">Итого к оплате:</span>
                            <span className="text-xl font-bold text-primary font-mono">
                              {pricing.finalPriceRub.toFixed(2)} ₽
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2.5 pt-2">
                          <LeafButton
                            variant="primary"
                            size="md"
                            disabled={currentAmount <= 0 || isTopUpProcessing}
                            onClick={handleExchangeTopUp}
                            className="w-full justify-center"
                            icon={isTopUpProcessing ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                          >
                            {isTopUpProcessing
                              ? 'Обработка платежа...'
                              : `Оплатить ${pricing.finalPriceRub.toFixed(2)} ₽`}
                          </LeafButton>
                          <p className="text-sm text-foreground/50 text-center">
                            Безопасная оплата через защищенный платежный шлюз Робокассы
                          </p>
                          <div className="pt-1 flex flex-col items-center gap-1.5 text-center">
                            <p className="text-sm text-foreground/60">
                              Нажимая кнопку оплаты, вы соглашаетесь с условиями:
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <BubbleElement
                                onClick={() => navigate('/oferta')}
                                size="sm"
                                className="text-sm text-primary font-semibold cursor-pointer"
                              >
                                Публичная оферта
                              </BubbleElement>
                              <BubbleElement
                                onClick={() => navigate('/payment/info')}
                                size="sm"
                                className="text-sm text-primary font-semibold cursor-pointer"
                              >
                                Правила оплаты и возврата
                              </BubbleElement>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 2. Points Exchange Section (SECOND) */}
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-transparent backdrop-blur-md text-amber-400 shadow-sm">
                    <Coins size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                      Магазин и обмен игровых очков
                    </h4>
                    <p className="text-sm text-foreground/70">
                      Обменивайте заработанные в викторинах очки на ИИкру по курсу 10 000 очков = 1 ИИкра
                    </p>
                  </div>
                </div>

                {/* Status Metric Cards in Liquid Glass Apple style */}
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground/70">Доступно очков</span>
                      <div className="p-2 rounded-xl border border-amber-500/25 bg-transparent text-amber-400">
                        <Coins size={20} />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      {formatPoints(profile.total_points ?? profile.points ?? 0)}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground/70">Получено из очков</span>
                      <div className="p-2 rounded-xl border border-primary/25 bg-transparent text-primary">
                        <BubbleCurrencyIcon className="w-5 h-5" />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-primary flex items-center gap-2">
                      <span>{profile.ballance_point ?? profile.balance_point ?? 0}</span>
                      <span className="text-sm font-bold text-foreground/80">{getIikrWord(profile.ballance_point ?? profile.balance_point ?? 0)}</span>
                    </div>
                    <p className="text-sm text-foreground/60">
                      Хранится в колонке ballance_point
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl p-5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground/70">Курс обмена</span>
                      <div className="p-2 rounded-xl border border-primary/25 bg-transparent text-primary">
                        <ArrowLeftRight size={20} />
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-foreground">
                      10 000 = 1 ИИкра
                    </div>
                    <p className="text-sm text-foreground/60">
                      Максимум доступно: {formatIikr(Math.floor((profile.total_points ?? profile.points ?? 0) / 10000))}
                    </p>
                  </div>
                </div>

                {/* Interactive Exchange Form */}
                <div className="rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl p-6 sm:p-8 space-y-6">
                  <div>
                    <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                      <Coins size={20} className="text-amber-400" />
                      Калькулятор и операция обмена очков
                    </h4>
                    <p className="text-sm text-foreground/70 mt-1">
                      Укажите количество очков для конвертации в ИИкру или выберите быстрый вариант.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-bold text-foreground/90 block">
                      Количество очков для обмена
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={10000}
                        step={10000}
                        value={exchangePointsInput}
                        onChange={(e) => setExchangePointsInput(e.target.value)}
                        placeholder="10000"
                        className="w-full rounded-2xl bg-transparent border border-primary/30 p-3.5 pr-28 text-base font-mono text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                      />
                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
                        <BubbleElement isBadge size="sm" className="!text-sm">
                          {getPointsWord(Number(exchangePointsInput) || 0)}
                        </BubbleElement>
                      </div>
                    </div>

                    {/* Preset quick buttons */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      <span className="text-sm text-foreground/60 mr-1">Быстрый выбор:</span>
                      {[10000, 20000, 50000, 100000].map((preset) => (
                        <LeafButton
                          key={`preset-${preset}`}
                          variant={Number(exchangePointsInput) === preset ? 'primary' : 'glass'}
                          size="sm"
                          onClick={() => setExchangePointsInput(String(preset))}
                          className="!text-sm"
                        >
                          {preset.toLocaleString('ru-RU')} (+{formatIikr(preset / 10000)})
                        </LeafButton>
                      ))}
                      <LeafButton
                        variant="glass"
                        size="sm"
                        onClick={() => {
                          const maxExchangeable = Math.floor((profile.total_points ?? profile.points ?? 0) / 10000) * 10000;
                          setExchangePointsInput(String(maxExchangeable > 0 ? maxExchangeable : 10000));
                        }}
                        className="!text-sm"
                      >
                        Все доступные ({formatPoints(Math.floor((profile.total_points ?? profile.points ?? 0) / 10000) * 10000)})
                      </LeafButton>
                    </div>
                  </div>

                  {/* Calculation breakdown */}
                  {(() => {
                    const pts = Math.floor(Number(exchangePointsInput) || 0);
                    const iikr = Math.floor(pts / 10000);
                    const currentPts = Number(profile.total_points ?? profile.points ?? 0);
                    const remainingPts = currentPts - pts;
                    const currentPointBalance = Number(profile.ballance_point ?? profile.balance_point ?? 0);
                    const nextPointBalance = currentPointBalance + iikr;
                    const isValid = pts >= 10000 && pts <= currentPts;

                    return (
                      <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md p-4 sm:p-5 space-y-3">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-foreground/70">К списанию:</span>
                          <span className="font-bold text-foreground font-mono">{formatPoints(pts)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-foreground/70">К зачислению в ballance_point:</span>
                          <span className="font-bold text-primary font-mono text-base">+{formatIikr(iikr)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-primary/10">
                          <span className="text-foreground/70">Остаток очков после операции:</span>
                          <span className={`font-bold font-mono ${remainingPts < 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {formatPoints(remainingPts)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-foreground/70">Новый баланс из очков (ballance_point):</span>
                          <span className="font-bold text-amber-400 font-mono">{formatIikr(nextPointBalance)}</span>
                        </div>

                        {pts > currentPts && (
                          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-medium flex items-center gap-2">
                            <AlertCircle size={18} />
                            <span>Недостаточно очков для обмена. Доступно: {formatPoints(currentPts)}</span>
                          </div>
                        )}

                        {pts < 10000 && (
                          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium flex items-center gap-2">
                            <AlertCircle size={18} />
                            <span>Минимальная сумма для обмена составляет 10 000 очков (1 ИИкра).</span>
                          </div>
                        )}

                        <div className="pt-3 flex justify-end">
                          <LeafButton
                            variant="primary"
                            size="md"
                            disabled={isExchanging || !isValid}
                            onClick={() => handleExchangePoints()}
                            icon={isExchanging ? <Loader2 size={18} className="animate-spin" /> : <ArrowLeftRight size={18} />}
                            className="w-full sm:w-auto justify-center"
                          >
                            {isExchanging ? 'Выполняется обмен...' : `Обменять ${formatPoints(pts)} на ${formatIikr(iikr)}`}
                          </LeafButton>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. TRANSACTIONS TAB (/profile/trans) */}
          {/* ========================================================================= */}
          {activeTab === 'trans' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Wallet size={22} className="text-primary" />
                    История транзакций и начислений
                  </h3>
                  <p className="text-sm text-foreground/70 mt-0.5">
                    Текущий баланс: <strong className="text-primary font-mono">{profile.balance} {getIikrWord(profile.balance)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Поиск по транзакциям..."
                    value={transSearch}
                    onChange={(e) => {
                      setTransSearch(e.target.value);
                      setTransPage(1);
                    }}
                    className="p-2.5 px-4 rounded-2xl bg-transparent border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                  />
                  <LeafButton
                    variant="glass"
                    size="sm"
                    onClick={fetchTransactions}
                    icon={<RefreshCcw size={16} className={loadingTransactions ? 'animate-spin' : ''} />}
                    title="Обновить список транзакций"
                  >
                    Обновить
                  </LeafButton>
                </div>
              </div>

              {/* Filters: Type & Game */}
              <div className="p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl space-y-3">
                {/* Type Filter */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-foreground/70 mr-1 shrink-0">Тип:</span>
                  {[
                    { id: 'all', label: 'Все операции' },
                    { id: 'income', label: 'Пополнения' },
                    { id: 'expense', label: 'Списания' },
                    { id: 'failed', label: 'Неудачные оплаты' }
                  ].map((tFilter) => (
                    <BubbleElement
                      key={tFilter.id}
                      size="sm"
                      active={transTypeFilter === tFilter.id}
                      onClick={() => {
                        setTransTypeFilter(tFilter.id as any);
                        setTransPage(1);
                      }}
                      title={`Фильтр: ${tFilter.label}`}
                    >
                      {tFilter.label}
                    </BubbleElement>
                  ))}
                </div>

                {/* Game Filter */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-primary/10">
                  <span className="text-sm font-bold text-foreground/70 mr-1 shrink-0">Игра:</span>
                  {[
                    { id: 'all', label: 'Все игры' },
                    { id: 'blitz', label: 'КвИИз' },
                    { id: 'millionaire', label: 'Квиллионер' },
                    { id: '100to1', label: 'Сто Квадному' },
                    { id: 'whatwherewhen', label: 'ЧтоГдеКвада' },
                    { id: 'jeopardy', label: 'Своя Икра' },
                    { id: 'melody', label: 'Укавкай мелодию' },
                    { id: 'other', label: 'Прочие' }
                  ].map((gFilter) => (
                    <BubbleElement
                      key={gFilter.id}
                      size="sm"
                      active={transGameFilter === gFilter.id}
                      onClick={() => {
                        setTransGameFilter(gFilter.id);
                        setTransPage(1);
                      }}
                      title={`Фильтр по игре: ${gFilter.label}`}
                    >
                      {gFilter.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>

              {loadingTransactions ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="animate-spin text-primary" size={32} />
                  <p className="text-sm text-foreground/60">Загрузка транзакций...</p>
                </div>
              ) : paginatedTransactions.length > 0 ? (
                <div className="space-y-4">
                  <div className="divide-y divide-primary/10 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl overflow-hidden">
                    {paginatedTransactions.map((tx, txIdx) => {
                      const typeLower = String(tx.type || '').toLowerCase();
                      const descLower = String(tx.description || '').toLowerCase();
                      const isFailedPayment =
                        typeLower === 'payment_failed' ||
                        typeLower.includes('fail') ||
                        descLower.includes('неудачная попытка оплаты') ||
                        descLower.includes('платеж отменен или отклонен');
                      const isPositive = !isFailedPayment && Number(tx.amount) > 0;
                      const dateStr = new Date(tx.created_at || tx.timestamp || Date.now()).toLocaleString('ru-RU');
                      return (
                        <div key={`tx-${tx.id || txIdx}-${txIdx}`} className="p-4 flex items-center justify-between gap-4 hover:bg-primary/5 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2.5 rounded-2xl border shrink-0 ${
                              isFailedPayment
                                ? 'border-rose-500/40 bg-transparent text-rose-400'
                                : isPositive 
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                                : 'border-destructive/30 bg-destructive/10 text-destructive'
                            }`}>
                              {isFailedPayment ? <XCircle size={18} /> : isPositive ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm text-foreground break-words">{tx.description || tx.type}</p>
                                {isFailedPayment && (
                                  <BubbleElement isBadge size="sm" className="!px-2 !py-0.5 !text-sm border-rose-500/40 text-rose-400">
                                    Не оплачено
                                  </BubbleElement>
                                )}
                              </div>
                              <p className="text-sm text-foreground/50 flex flex-wrap items-center gap-2 font-mono mt-0.5">
                                <span>{dateStr}</span>
                                {tx.reference_id && <span>• Ref: {tx.reference_id}</span>}
                              </p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-base font-black font-mono flex items-center justify-end gap-1 ${
                              isFailedPayment ? 'text-rose-400' : isPositive ? 'text-primary' : 'text-destructive'
                            }`}>
                              {isFailedPayment ? '0' : isPositive ? `+${tx.amount}` : tx.amount}
                              <BubbleCurrencyIcon className="w-4 h-4 inline" />
                            </span>
                            <span className="text-sm text-foreground/40 block">
                              {isFailedPayment ? 'Отмена' : (tx.currency || 'ИИкр')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination Bar (50 items per page) */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl">
                    <span className="text-sm text-foreground/70">
                      Показано {filteredTransactions.length === 0 ? 0 : (currentTransPage - 1) * TRANS_PER_PAGE + 1}–{Math.min(currentTransPage * TRANS_PER_PAGE, filteredTransactions.length)} из {filteredTransactions.length} транзакций (по {TRANS_PER_PAGE} на странице)
                    </span>

                    <div className="flex items-center gap-2">
                      <LeafButton
                        variant="glass"
                        size="sm"
                        disabled={currentTransPage <= 1}
                        onClick={() => setTransPage(prev => Math.max(1, prev - 1))}
                        icon={<ChevronLeft size={16} />}
                      >
                        Назад
                      </LeafButton>

                      <span className="px-3 py-1.5 rounded-2xl bg-transparent border border-primary/20 text-sm font-bold text-primary font-mono backdrop-blur-md">
                        {currentTransPage} / {totalTransPages}
                      </span>

                      <LeafButton
                        variant="glass"
                        size="sm"
                        disabled={currentTransPage >= totalTransPages}
                        onClick={() => setTransPage(prev => Math.min(totalTransPages, prev + 1))}
                        icon={<ChevronRight size={16} />}
                      >
                        Вперед
                      </LeafButton>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-foreground/40 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl">
                  <Wallet size={40} className="mb-2 opacity-40 text-primary" />
                  <p className="text-sm font-bold">Транзакций не найдено</p>
                  <p className="text-sm text-foreground/50 mt-1">Попробуйте изменить выбранные фильтры или строку поиска</p>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. NOTIFICATIONS TAB (/profile/notifications) */}
          {/* ========================================================================= */}
          {activeTab === 'notifications' && (
            <div className="space-y-5 min-w-0">
              <PWAInstallAndPushCard
                compact
                userId={profile.uid}
                onOpenNotificationSettings={() => setShowProfileNotifSettings(true)}
              />
              <NotificationsList
                userId={profile.uid}
                onSelectNotification={(notif) => setSelectedNotificationForModal(notif)}
                onUnreadCountChange={(c) => {
                  setUnreadNotificationsCount(c);
                  fetchUnreadNotificationsCount();
                }}
              />
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. FRIENDS & REFERRALS TAB (/profile/ref) */}
          {/* ========================================================================= */}
          {activeTab === 'ref' && (
            <FriendsTab 
              currentUser={profile} 
              onUnreadCountChange={(c) => setUnreadFriendsMessagesCount(c)} 
            />
          )}

          {/* ========================================================================= */}
          {/* 5. GAME HISTORY TAB (/profile/history) */}
          {/* ========================================================================= */}
          {activeTab === 'history' && (() => {
            const isJeopardyItem = (item: any) => {
              if (!item) return false;
              const gKey = (item.game_id || item.game_type || '').toLowerCase();
              const gTitle = (item.game_title || item.title || '').toLowerCase();
              const idStr = String(item.id || item.pack_id || item.packId || '').toLowerCase();
              return gKey.includes('jeopardy') || gTitle.includes('своя игра') || gTitle.includes('своя икра') || gTitle.includes('икра') || idStr.includes('jeopardy');
            };

            const resolveItemTopic = (item: any): string => {
              if (!item) return 'Общие знания';
              let stateObj: any = null;
              if (item.state) {
                stateObj = typeof item.state === 'string' ? (() => { try { return JSON.parse(item.state); } catch { return null; } })() : item.state;
              }
              if (stateObj?.gameTopic && typeof stateObj.gameTopic === 'string' && stateObj.gameTopic.trim().length > 0) {
                return stateObj.gameTopic.trim();
              }
              const packId = item.id || item.pack_id || item.packId;
              if (packId) {
                const matchingProg = (gameProgressList || []).find((gp: any) => gp && gp.pack_id === packId);
                if (matchingProg) {
                  let gpState: any = null;
                  if (matchingProg.state) {
                    gpState = typeof matchingProg.state === 'string' ? (() => { try { return JSON.parse(matchingProg.state); } catch { return null; } })() : matchingProg.state;
                  }
                  if (gpState?.gameTopic && typeof gpState.gameTopic === 'string' && gpState.gameTopic.trim().length > 0) {
                    return gpState.gameTopic.trim();
                  }
                  if (matchingProg.topic && matchingProg.topic !== 'Общие знания' && matchingProg.topic !== 'Разные') {
                    return matchingProg.topic.trim();
                  }
                }
                const matchingPack = (savedPacks || []).find((sp: any) => sp && sp.id === packId);
                if (matchingPack?.topic && matchingPack.topic !== 'Общие знания' && matchingPack.topic !== 'Разные') {
                  return matchingPack.topic.trim();
                }
              }
              if (item.topic && typeof item.topic === 'string' && item.topic.trim().length > 0 && item.topic !== 'Разные') {
                return item.topic.trim();
              }
              return item.topic || 'Общие знания';
            };

            const resolveItemGameTitle = (item: any): string => {
              if (!item) return 'КвИИз';
              if (isJeopardyItem(item)) return 'Своя Икра';
              return getGameTitle(item.game_id || item.game_type || item.game_title);
            };

            const isItemMultiplayer = (item: any): boolean => {
              if (!item) return false;
              let stateObj: any = null;
              if (item.state) {
                stateObj = typeof item.state === 'string'
                  ? (() => { try { return JSON.parse(item.state); } catch { return null; } })()
                  : item.state;
              }
              const packId = item.id || item.pack_id || item.packId;
              const matchingProg = packId
                ? (gameProgressList || []).find((gp: any) => gp && (gp.pack_id === packId || (item.mp_room_id && gp.mp_room_id === item.mp_room_id)))
                : null;
              const matchingPack = packId
                ? (savedPacks || []).find((sp: any) => sp && sp.id === packId)
                : null;

              return Boolean(
                item.is_multiplayer ||
                item.mp_room_id ||
                item.room_id ||
                item.mode === 'multi' ||
                item.play_mode === 'multi' ||
                item.playMode === 'multi' ||
                stateObj?.isMultiplayer ||
                stateObj?.playMode === 'multi' ||
                stateObj?.mpRoomId ||
                matchingProg?.is_multiplayer ||
                matchingProg?.mp_room_id ||
                matchingPack?.is_multiplayer ||
                matchingPack?.mp_room_id
              );
            };

            // Real recorded sessions only (no synthetic fake records)
            const effectiveSessions = gameHistory || [];

            // Filter sessions by game type, play mode, difficulty, topic, and search query
            const filteredSessions = effectiveSessions.filter((s: any) => {
              const gameKey = (s.game_type || s.game_id || '').toLowerCase();
              const gameTitle = (s.game_title || '').toLowerCase();
              const isJeopardy = isJeopardyItem(s);
              const resolvedTopic = resolveItemTopic(s);

              if (historyModeFilter !== 'all') {
                const isMpItem = isItemMultiplayer(s);
                if (historyModeFilter === 'single' && isMpItem) return false;
                if (historyModeFilter === 'multi' && !isMpItem) return false;
              }

              if (historyGameFilter !== 'all') {
                const matchType = 
                  (historyGameFilter === 'blitz' && (gameKey.includes('blitz') || gameTitle.includes('блиц'))) ||
                  (historyGameFilter === 'millionaire' && (gameKey.includes('millionaire') || gameTitle.includes('миллионер'))) ||
                  (historyGameFilter === '100to1' && (gameKey.includes('100to1') || gameKey.includes('100') || gameTitle.includes('100'))) ||
                  (historyGameFilter === 'whatwherewhen' && (gameKey.includes('whatwherewhen') || gameKey.includes('chgk') || gameTitle.includes('что? где?') || gameTitle.includes('чтогдеквада') || gameTitle.includes('чгк'))) ||
                  (historyGameFilter === 'melody' && (gameKey.includes('melody') || gameTitle.includes('мелоди'))) ||
                  (historyGameFilter === 'jeopardy' && isJeopardy) ||
                  (historyGameFilter === 'iqbox' && (gameKey.includes('iqbox') || gameTitle.includes('iq')));

                if (!matchType) return false;
              }

              if (historyDifficultyFilter !== 'all' && historyGameFilter !== 'jeopardy' && !isJeopardy) {
                const dLabel = getDifficultyLabel(s.difficulty).toLowerCase();
                const targetLabel = getDifficultyLabel(historyDifficultyFilter).toLowerCase();
                if (dLabel !== targetLabel) return false;
              }

              if (historyTopicFilter.trim()) {
                const topicStr = resolvedTopic.toLowerCase();
                if (!topicStr.includes(historyTopicFilter.toLowerCase().trim())) return false;
              }

              if (historySearch.trim()) {
                const q = historySearch.toLowerCase().trim();
                const matchSearch = 
                  (s.game_title && s.game_title.toLowerCase().includes(q)) ||
                  (resolvedTopic.toLowerCase().includes(q)) ||
                  (s.topic && s.topic.toLowerCase().includes(q)) ||
                  (s.difficulty && s.difficulty.toLowerCase().includes(q));
                if (!matchSearch) return false;
              }

              if (historyResultFilter !== 'all') {
                const isWin = s.is_win || s.result === 'win';
                if (historyResultFilter === 'win' && !isWin) return false;
                if (historyResultFilter === 'loss' && isWin) return false;
              }

              return true;
            });

            // Filter saved packs by game type, play mode, difficulty, topic, and search query
            const filteredPacks = savedPacks.filter((p: any) => {
              const gameKey = (p.game_id || '').toLowerCase();
              const isJeopardy = isJeopardyItem(p);
              const resolvedTopic = resolveItemTopic(p);

              if (historyModeFilter !== 'all') {
                const isMpItem = isItemMultiplayer(p);
                if (historyModeFilter === 'single' && isMpItem) return false;
                if (historyModeFilter === 'multi' && !isMpItem) return false;
              }

              if (historyGameFilter !== 'all') {
                if (historyGameFilter === 'blitz' && !gameKey.includes('blitz')) return false;
                if (historyGameFilter === 'millionaire' && !gameKey.includes('millionaire')) return false;
                if (historyGameFilter === '100to1' && !gameKey.includes('100to1') && !gameKey.includes('100')) return false;
                if (historyGameFilter === 'whatwherewhen' && !gameKey.includes('whatwherewhen') && !gameKey.includes('chgk') && !gameKey.includes('чтогдеквада')) return false;
                if (historyGameFilter === 'melody' && !gameKey.includes('melody')) return false;
                if (historyGameFilter === 'jeopardy' && !isJeopardy) return false;
                if (historyGameFilter === 'iqbox' && !gameKey.includes('iqbox')) return false;
              }

              if (historyDifficultyFilter !== 'all' && historyGameFilter !== 'jeopardy' && !isJeopardy) {
                const dLabel = getDifficultyLabel(p.difficulty).toLowerCase();
                const targetLabel = getDifficultyLabel(historyDifficultyFilter).toLowerCase();
                if (dLabel !== targetLabel) return false;
              }

              if (historyTopicFilter.trim()) {
                const topicStr = resolvedTopic.toLowerCase();
                if (!topicStr.includes(historyTopicFilter.toLowerCase().trim())) return false;
              }

              if (historySearch.trim()) {
                const q = historySearch.toLowerCase().trim();
                const matchSearch = 
                  (p.title && p.title.toLowerCase().includes(q)) ||
                  (p.game_title && p.game_title.toLowerCase().includes(q)) ||
                  (resolvedTopic.toLowerCase().includes(q)) ||
                  (p.topic && p.topic.toLowerCase().includes(q)) ||
                  (p.difficulty && p.difficulty.toLowerCase().includes(q));
                if (!matchSearch) return false;
              }

              return true;
            });

            // Filter active in-progress games
            const filteredProgress = gameProgressList.filter((p: any) => {
              const gameKey = (p.game_type || '').toLowerCase();
              const isJeopardy = isJeopardyItem(p);
              const resolvedTopic = resolveItemTopic(p);

              if (historyModeFilter !== 'all') {
                const isMpItem = isItemMultiplayer(p);
                if (historyModeFilter === 'single' && isMpItem) return false;
                if (historyModeFilter === 'multi' && !isMpItem) return false;
              }

              if (historyGameFilter !== 'all') {
                if (historyGameFilter === 'blitz' && !gameKey.includes('blitz')) return false;
                if (historyGameFilter === 'millionaire' && !gameKey.includes('millionaire')) return false;
                if (historyGameFilter === '100to1' && !gameKey.includes('100to1') && !gameKey.includes('100')) return false;
                if (historyGameFilter === 'whatwherewhen' && !gameKey.includes('whatwherewhen') && !gameKey.includes('chgk') && !gameKey.includes('чтогдеквада')) return false;
                if (historyGameFilter === 'melody' && !gameKey.includes('melody')) return false;
                if (historyGameFilter === 'jeopardy' && !isJeopardy) return false;
                if (historyGameFilter === 'iqbox' && !gameKey.includes('iqbox')) return false;
              }

              if (historyDifficultyFilter !== 'all' && historyGameFilter !== 'jeopardy' && !isJeopardy) {
                const dLabel = getDifficultyLabel(p.difficulty).toLowerCase();
                const targetLabel = getDifficultyLabel(historyDifficultyFilter).toLowerCase();
                if (dLabel !== targetLabel) return false;
              }

              if (historyTopicFilter.trim()) {
                const topicStr = resolvedTopic.toLowerCase();
                if (!topicStr.includes(historyTopicFilter.toLowerCase().trim())) return false;
              }

              if (historySearch.trim()) {
                const q = historySearch.toLowerCase().trim();
                const matchSearch = 
                  (p.game_title && p.game_title.toLowerCase().includes(q)) ||
                  (resolvedTopic.toLowerCase().includes(q)) ||
                  (p.topic && p.topic.toLowerCase().includes(q)) ||
                  (p.game_type && p.game_type.toLowerCase().includes(q));
                if (!matchSearch) return false;
              }

              return true;
            });

            // Universal extractor for creation / updated timestamp across all game cards and session objects
            const getItemCreatedAt = (item: any): number => {
              if (!item) return 0;
              const raw = item.created_at || item.updated_at || item.timestamp;
              if (typeof raw === 'number' && !isNaN(raw) && raw > 0) return raw;
              if (typeof raw === 'string' && raw.trim().length > 0) {
                const trimmed = raw.trim();
                if (/^\d{10,}$/.test(trimmed)) {
                  const num = Number(trimmed);
                  if (!isNaN(num)) return num < 10000000000 ? num * 1000 : num;
                }
                const iso = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T') + 'Z';
                const parsed = Date.parse(iso);
                if (!isNaN(parsed)) return parsed;
                const directParsed = Date.parse(trimmed);
                if (!isNaN(directParsed)) return directParsed;
              }
              const idStr = String(item.id || item.pack_id || item.packId || '');
              const match = idStr.match(/\d{10,13}/);
              if (match) {
                const num = Number(match[0]);
                if (!isNaN(num)) return num < 10000000000 ? num * 1000 : num;
              }
              return 0;
            };

            // Universal sorting engine supporting date (default), title, topic, and game type
            const sortGameItems = <T extends any>(
              items: T[],
              sortBy: 'date' | 'title' | 'topic' | 'gameType',
              order: 'desc' | 'asc'
            ): T[] => {
              return [...items].sort((a: any, b: any) => {
                let cmp = 0;
                if (sortBy === 'date') {
                  const timeA = getItemCreatedAt(a);
                  const timeB = getItemCreatedAt(b);
                  cmp = timeA - timeB;
                  if (cmp === 0) {
                    const titleA = (a.title || a.game_title || resolveItemGameTitle(a) || '');
                    const titleB = (b.title || b.game_title || resolveItemGameTitle(b) || '');
                    cmp = titleA.localeCompare(titleB, 'ru', { sensitivity: 'base' });
                  }
                } else if (sortBy === 'title') {
                  const titleA = (a.title || a.game_title || resolveItemGameTitle(a) || '');
                  const titleB = (b.title || b.game_title || resolveItemGameTitle(b) || '');
                  cmp = titleA.localeCompare(titleB, 'ru', { sensitivity: 'base' });
                  if (cmp === 0) {
                    cmp = getItemCreatedAt(b) - getItemCreatedAt(a);
                  }
                } else if (sortBy === 'topic') {
                  const topicA = resolveItemTopic(a);
                  const topicB = resolveItemTopic(b);
                  cmp = topicA.localeCompare(topicB, 'ru', { sensitivity: 'base' });
                  if (cmp === 0) {
                    cmp = getItemCreatedAt(b) - getItemCreatedAt(a);
                  }
                } else if (sortBy === 'gameType') {
                  const gameA = resolveItemGameTitle(a);
                  const gameB = resolveItemGameTitle(b);
                  cmp = gameA.localeCompare(gameB, 'ru', { sensitivity: 'base' });
                  if (cmp === 0) {
                    const topicA = resolveItemTopic(a);
                    const topicB = resolveItemTopic(b);
                    cmp = topicA.localeCompare(topicB, 'ru', { sensitivity: 'base' });
                    if (cmp === 0) {
                      cmp = getItemCreatedAt(b) - getItemCreatedAt(a);
                    }
                  }
                }

                return order === 'desc' ? -cmp : cmp;
              });
            };

            // Sorted game lists for saved games, in-progress games, and history sessions
            const sortedPacks = sortGameItems(filteredPacks, historySortBy, historySortOrder);
            const sortedProgress = sortGameItems(filteredProgress, historySortBy, historySortOrder);
            const sortedSessions = sortGameItems(filteredSessions, historySortBy, historySortOrder);

            const totalSessionsPages = Math.max(1, Math.ceil(sessionsTotalCount / SESSIONS_PER_PAGE));
            const currentSessionsPage = Math.min(sessionsPage, totalSessionsPages);
            // Current batch is already server-paginated for currentSessionsPage
            const paginatedSessions = sortedSessions;

            // Authoritative aggregate stats across ALL matching sessions (from server)
            const totalFiltered = sessionStats.totalCount || filteredSessions.length;
            const winsFiltered = sessionStats.wins;
            const lossesFiltered = sessionStats.losses;
            const winRateFiltered = sessionStats.winRate;
            const totalScoreFiltered = sessionStats.totalScore;
            const avgScoreFiltered = sessionStats.avgScore;

            // Total correct vs incorrect answers from actual generated_questions database
            const totalQuestionsAnswered = questionStats.answered_count;
            const totalCorrectAnswers = questionStats.correct_count;
            const totalIncorrectAnswers = questionStats.incorrect_count;
            const accuracyRate = questionStats.accuracy_rate;

            // Distribution by game types across ALL matching sessions
            const gameTypesMap: { [key: string]: number } = {};
            if (sessionStats.byGame.length > 0) {
              sessionStats.byGame.forEach((row) => {
                const cleanTitle = resolveItemGameTitle(row);
                gameTypesMap[cleanTitle] = (gameTypesMap[cleanTitle] || 0) + Number(row.cnt || 0);
              });
            } else {
              filteredSessions.forEach((s: any) => {
                const cleanTitle = resolveItemGameTitle(s);
                gameTypesMap[cleanTitle] = (gameTypesMap[cleanTitle] || 0) + 1;
              });
            }

            const gameDistributionData = Object.entries(gameTypesMap).map(([name, value]) => ({ name, value }));

            // Winrate chart data
            const winrateData = [
              { name: 'Победы', value: winsFiltered, color: '#99D037' },
              { name: 'Поражения', value: lossesFiltered, color: '#f43f5e' }
            ];

            // Answers Accuracy chart data
            const accuracyData = [
              { name: 'Правильно', value: totalCorrectAnswers, color: '#99D037' },
              { name: 'Ошибки', value: totalIncorrectAnswers, color: '#e11d48' }
            ];

            // Difficulty chart data with new naming: ИИкра, Головастик, Квант, Ляга
            const difficultyMap: { [key: string]: number } = { 'ИИкра': 0, 'Головастик': 0, 'Квант': 0, 'Ляга': 0 };
            if (sessionStats.byDifficulty.length > 0) {
              sessionStats.byDifficulty.forEach((row) => {
                const label = getDifficultyLabel(row.difficulty);
                if (difficultyMap[label] !== undefined) {
                  difficultyMap[label] = (difficultyMap[label] || 0) + Number(row.cnt || 0);
                } else {
                  difficultyMap['Головастик'] = (difficultyMap['Головастик'] || 0) + Number(row.cnt || 0);
                }
              });
            } else {
              filteredSessions.forEach((s: any) => {
                const label = getDifficultyLabel(s.difficulty);
                if (difficultyMap[label] !== undefined) {
                  difficultyMap[label] = (difficultyMap[label] || 0) + 1;
                } else {
                  difficultyMap['Головастик'] = (difficultyMap['Головастик'] || 0) + 1;
                }
              });
            }
            filteredProgress.forEach((p: any) => {
              const label = getDifficultyLabel(p.difficulty);
              if (difficultyMap[label] !== undefined) {
                difficultyMap[label] = (difficultyMap[label] || 0) + 1;
              } else {
                difficultyMap['Головастик'] = (difficultyMap['Головастик'] || 0) + 1;
              }
            });

            const difficultyData = [
              { name: 'ИИкра', value: difficultyMap['ИИкра'] || 0, color: '#38bdf8' },
              { name: 'Головастик', value: difficultyMap['Головастик'] || 0, color: '#99D037' },
              { name: 'Квант', value: difficultyMap['Квант'] || 0, color: '#f59e0b' },
              { name: 'Ляга', value: difficultyMap['Ляга'] || 0, color: '#a855f7' }
            ];

            const totalPlayedAndActive = totalFiltered + (progressTotalCount || filteredProgress.length);

            const CHART_COLORS = ['#99D037', '#38bdf8', '#fbbf24', '#f43f5e', '#a855f7', '#34d399', '#f97316'];

            const activeHistoryFiltersCount =
              (historyModeFilter !== 'all' ? 1 : 0) +
              (historyDifficultyFilter !== 'all' && historyGameFilter !== 'jeopardy' ? 1 : 0) +
              (historyGameFilter !== 'all' ? 1 : 0) +
              (historyResultFilter !== 'all' ? 1 : 0) +
              (historyTopicFilter.trim() ? 1 : 0) +
              (historySortBy !== 'date' || historySortOrder !== 'desc' ? 1 : 0);

            const resetAllHistoryFilters = () => {
              setHistoryModeFilter('all');
              setHistoryDifficultyFilter('all');
              setHistoryGameFilter('all');
              setHistoryResultFilter('all');
              setHistoryTopicFilter('');
              setHistorySortBy('date');
              setHistorySortOrder('desc');
              setSessionsPage(1);
            };

            return (
              <div className="space-y-6">
                {/* Header & Search */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                      <Gamepad2 size={22} className="text-primary" />
                      История и сохраненные игры
                    </h3>
                    <p className="text-sm text-foreground/70 mt-0.5">
                      Повторный запуск созданных игр без ожидания генерации и детальная статистика
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full md:w-auto min-w-0">
                    <input
                      type="text"
                      placeholder="Поиск по теме или игре..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="p-2.5 px-3.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary flex-1 min-w-0 md:w-64"
                    />
                    <BubbleElement
                      size="sm"
                      active={isHistoryFiltersModalOpen || activeHistoryFiltersCount > 0}
                      onClick={() => setIsHistoryFiltersModalOpen(true)}
                      icon={<Filter size={18} />}
                      className="md:hidden p-2.5 shrink-0"
                      title="Фильтры и сортировка"
                    >
                      {activeHistoryFiltersCount > 0 ? (
                        <span className="text-sm font-black">{activeHistoryFiltersCount}</span>
                      ) : undefined}
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      onClick={fetchHistory}
                      icon={<RefreshCcw size={18} className={loadingHistory ? 'animate-spin' : ''} />}
                      className="p-2.5 shrink-0"
                      title="Обновить историю"
                    />
                  </div>
                </div>

                {/* Mobile Active Filters Summary Strip */}
                {activeHistoryFiltersCount > 0 && (
                  <div className="flex md:hidden flex-wrap items-center gap-2 p-2.5 rounded-2xl bg-transparent border border-primary/25 backdrop-blur-xl">
                    <BubbleElement
                      size="sm"
                      active
                      onClick={() => setIsHistoryFiltersModalOpen(true)}
                      icon={<Filter size={14} />}
                      className="text-sm"
                    >
                      Фильтры ({activeHistoryFiltersCount})
                    </BubbleElement>
                    <BubbleElement
                      size="sm"
                      onClick={resetAllHistoryFilters}
                      icon={<RotateCcw size={14} />}
                      className="text-sm"
                    >
                      Сбросить все
                    </BubbleElement>
                  </div>
                )}

                {/* Sub-tab switcher: Saved Game Packs vs In-Progress Games vs Played Sessions */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-xl w-full sm:w-auto">
                    <LeafButton
                      active={historySubTab === 'packs'}
                      variant={historySubTab === 'packs' ? 'primary' : 'glass'}
                      size="sm"
                      onClick={() => setHistorySubTab('packs')}
                      title="Коллекция сохраненных игровых пакетов"
                      className="w-full sm:w-auto justify-center"
                    >
                      Сохраненные игры ({packsTotalCount || filteredPacks.length})
                    </LeafButton>
                    <LeafButton
                      active={historySubTab === 'progress'}
                      variant={historySubTab === 'progress' ? 'primary' : 'glass'}
                      size="sm"
                      onClick={() => setHistorySubTab('progress')}
                      title="Игры с сохраненным прогрессом прохождения"
                      className="w-full sm:w-auto justify-center"
                    >
                      Незавершенные игры ({progressTotalCount || filteredProgress.length})
                    </LeafButton>
                    <LeafButton
                      active={historySubTab === 'sessions'}
                      variant={historySubTab === 'sessions' ? 'primary' : 'glass'}
                      size="sm"
                      onClick={() => setHistorySubTab('sessions')}
                      title="Детальная статистика и аналитика завершенных сессий"
                      className="w-full sm:w-auto justify-center"
                    >
                      Статистика сессий ({sessionsTotalCount || filteredSessions.length})
                    </LeafButton>
                  </div>

                  <div className="hidden md:flex flex-wrap items-center gap-3 w-full sm:w-auto">
                    {/* Play Mode Filter: Все / Одиночная / Мультиплеер */}
                    <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-xl w-full sm:w-auto">
                      <span className="text-sm font-bold text-foreground/70 px-2 shrink-0">Режим:</span>
                      {[
                        { id: 'all', label: 'Все' },
                        { id: 'single', label: 'Одиночная' },
                        { id: 'multi', label: 'Мультиплеер' }
                      ].map((mOpt) => (
                        <BubbleElement
                          key={mOpt.id}
                          size="sm"
                          active={historyModeFilter === mOpt.id}
                          onClick={() => {
                            setHistoryModeFilter(mOpt.id as 'all' | 'single' | 'multi');
                            setSessionsPage(1);
                          }}
                          title={`Фильтр по режиму: ${mOpt.label}`}
                        >
                          {mOpt.label}
                        </BubbleElement>
                      ))}
                    </div>

                    {/* Difficulty Filter Tag Cloud (Hidden for Jeopardy) */}
                    {historyGameFilter !== 'jeopardy' && (
                      <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-xl w-full sm:w-auto">
                        <span className="text-sm font-bold text-foreground/70 px-2 shrink-0">Сложность:</span>
                        {[
                          { id: 'all', label: 'Все' },
                          { id: 'dummy', label: 'ИИкра' },
                          { id: 'people', label: 'Головастик' },
                          { id: 'genius', label: 'Квант' },
                          { id: 'god', label: 'Ляга' }
                        ].map((diff) => (
                          <BubbleElement
                            key={diff.id}
                            size="sm"
                            active={historyDifficultyFilter === diff.id}
                            onClick={() => setHistoryDifficultyFilter(diff.id)}
                            title={`Фильтр по уровню: ${diff.label}`}
                          >
                            {diff.label}
                          </BubbleElement>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Game Filter & Topic Filter Controls (Desktop inline, Mobile in modal) */}
                <div className="hidden md:flex flex-col gap-3 p-3.5 rounded-2xl bg-transparent border border-primary/20 backdrop-blur-md">
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Game Filter Tag Cloud */}
                    <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                      <span className="text-sm font-bold text-foreground/70 mr-1 shrink-0">Игра:</span>
                      {[
                        { id: 'all', label: 'Все' },
                        { id: 'blitz', label: 'КвИИз' },
                        { id: 'millionaire', label: 'Квиллионер' },
                        { id: '100to1', label: 'Сто Квадному' },
                        { id: 'whatwherewhen', label: 'ЧтоГдеКвада' },
                        { id: 'melody', label: 'Укавкай мелодию' },
                        { id: 'jeopardy', label: 'Своя Икра' }
                      ].map((filter) => (
                        <BubbleElement
                          key={filter.id}
                          size="sm"
                          active={historyGameFilter === filter.id}
                          onClick={() => {
                            setHistoryGameFilter(filter.id);
                            setSessionsPage(1);
                          }}
                          title={`Фильтр по игре: ${filter.label}`}
                        >
                          {filter.label}
                        </BubbleElement>
                      ))}
                    </div>

                    {/* Result Filter Tag Cloud (Победы / Поражения) */}
                    <div className="flex flex-wrap items-center gap-1.5 py-0.5">
                      <span className="text-sm font-bold text-foreground/70 mr-1 shrink-0">Результат:</span>
                      {[
                        { id: 'all', label: 'Все партии' },
                        { id: 'win', label: 'Победы' },
                        { id: 'loss', label: 'Поражения' }
                      ].map((rFilter) => (
                        <BubbleElement
                          key={rFilter.id}
                          size="sm"
                          active={historyResultFilter === rFilter.id}
                          onClick={() => {
                            setHistoryResultFilter(rFilter.id as any);
                            setSessionsPage(1);
                          }}
                          title={`Фильтр по исходу: ${rFilter.label}`}
                        >
                          {rFilter.label}
                        </BubbleElement>
                      ))}
                    </div>

                    {/* Topic Filter Controls with Catalog Module (Stacked Vertically to avoid horizontal overflow) */}
                    <div className="flex flex-col gap-2 w-full lg:w-auto lg:min-w-[260px]">
                      <BubbleElement
                        type="button"
                        size="sm"
                        onClick={() => setIsHistoryTopicModalOpen(true)}
                        icon={<Sparkles size={14} />}
                        className="w-full justify-center"
                      >
                        Каталог тем ({historyTotalTopicsCount || historyDbTopics.length})
                      </BubbleElement>

                      <div className="relative flex items-center w-full">
                        <input
                          type="text"
                          placeholder="Фильтр по теме..."
                          value={historyTopicFilter}
                          onChange={e => setHistoryTopicFilter(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-2xl bg-background/40 border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-foreground/40 backdrop-blur-md"
                        />
                        {historyTopicFilter && (
                          <button
                            onClick={() => setHistoryTopicFilter('')}
                            className="absolute right-2.5 p-1 rounded-lg text-xs text-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Очистить фильтр темы"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active topic indicator if selected */}
                  {historyTopicFilter && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-foreground/60 font-semibold">Активный фильтр темы:</span>
                      <BubbleElement
                        type="button"
                        active={true}
                        size="sm"
                        onClick={() => setHistoryTopicFilter('')}
                        icon={<X size={12} />}
                        className="text-xs py-0.5"
                      >
                        {historyTopicFilter}
                      </BubbleElement>
                    </div>
                  )}

                  {/* Sorting Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-primary/20">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground/80 flex items-center gap-1.5 mr-1 shrink-0">
                        <ArrowUpDown size={15} className="text-primary" />
                        Сортировка:
                      </span>
                      {[
                        { id: 'date', label: 'По дате', icon: <Calendar size={14} /> },
                        { id: 'title', label: 'По названию', icon: <Type size={14} /> },
                        { id: 'topic', label: 'По теме', icon: <Sparkles size={14} /> },
                        { id: 'gameType', label: 'По типу игры', icon: <Gamepad2 size={14} /> }
                      ].map((sortOpt) => {
                        const isActive = historySortBy === sortOpt.id;
                        return (
                          <BubbleElement
                            key={sortOpt.id}
                            type="button"
                            size="sm"
                            active={isActive}
                            icon={sortOpt.icon}
                            onClick={() => handleSelectSort(sortOpt.id as any)}
                            title={`Сортировать ${sortOpt.label.toLowerCase()}${isActive ? ' (нажмите для смены направления)' : ''}`}
                          >
                            <span>{sortOpt.label}</span>
                            {isActive && (
                              <span className="ml-1 text-xs font-black">
                                {historySortOrder === 'desc' ? '↓' : '↑'}
                              </span>
                            )}
                          </BubbleElement>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2">
                      <BubbleElement
                        type="button"
                        size="sm"
                        onClick={() => setHistorySortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                        title={historySortOrder === 'desc' ? 'По убыванию (нажмите для переключения)' : 'По возрастанию (нажмите для переключения)'}
                        icon={<ArrowUpDown size={14} />}
                      >
                        {historySortBy === 'date'
                          ? (historySortOrder === 'desc' ? 'Сначала новые' : 'Сначала старые')
                          : (historySortOrder === 'asc' ? 'От А до Я' : 'От Я до А')}
                      </BubbleElement>
                    </div>
                  </div>
                </div>

                {/* VIEW 1: SAVED GAME PACKS (Instant replay, status, and 3 actions) */}
                {historySubTab === 'packs' && (
                  <div className="space-y-4">
                    {loadingHistory ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="animate-spin text-primary" size={32} />
                      </div>
                    ) : sortedPacks.length > 0 ? (
                      <>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {sortedPacks.map((pack: any, packIdx: number) => {
                          const itemCreatedTime = getItemCreatedAt(pack);
                          const dateStr = itemCreatedTime > 0 ? new Date(itemCreatedTime).toLocaleDateString('ru-RU') : (pack.created_at || '—');
                          const gameTitle = resolveItemGameTitle(pack);
                          const displayTopic = resolveItemTopic(pack);

                          // Authoritative progress logic (including multiplayer rooms)
                          const matchingProgress = gameProgressList.find(
                            (p: any) => p && (p.pack_id === pack.id || (pack.mp_room_id && p.mp_room_id === pack.mp_room_id))
                          );
                          const isMp = Boolean(pack.is_multiplayer || matchingProgress?.is_multiplayer || pack.mp_room_id || matchingProgress?.mp_room_id);
                          const mpRoomId = pack.mp_room_id || matchingProgress?.mp_room_id || null;
                          const mpStatus = pack.mp_status || matchingProgress?.mp_status || (isMp ? 'active' : null);
                          const mpMyFinished = Boolean(pack.mp_my_finished || matchingProgress?.mp_my_finished);
                          const mpFinishRemainingSec = typeof pack.mp_finish_remaining_seconds === 'number'
                            ? pack.mp_finish_remaining_seconds
                            : typeof matchingProgress?.mp_finish_remaining_seconds === 'number'
                            ? matchingProgress.mp_finish_remaining_seconds
                            : null;
                          const mpTimerStr = formatMpCountdownSec(mpFinishRemainingSec);

                          const is100to1 = (pack.game_id || pack.game_title || matchingProgress?.game_type || matchingProgress?.game_id) === '100to1';
                          const isWWW = (pack.game_id || pack.game_title || matchingProgress?.game_type || matchingProgress?.game_id) === 'whatwherewhen';
                          const totalSteps = Number(
                            matchingProgress?.total_steps || 
                            pack.total_steps || 
                            (is100to1 ? 24 : 0) || 
                            (isWWW ? 11 : 0) ||
                            pack.question_count || 
                            (pack.questions?.length) || 
                            10
                          );
                          const progressStateObj = typeof matchingProgress?.state === 'string'
                            ? (() => { try { return JSON.parse(matchingProgress.state); } catch { return {}; } })()
                            : (matchingProgress?.state || {});
                          const rawCurrentStep = matchingProgress !== undefined
                            ? (isWWW
                                ? (Array.isArray(progressStateObj.answeredIndices) && progressStateObj.answeredIndices.length > 0
                                    ? progressStateObj.answeredIndices.length
                                    : (typeof progressStateObj.expertScore === 'number' && typeof progressStateObj.viewerScore === 'number' && (progressStateObj.expertScore + progressStateObj.viewerScore > 0)
                                        ? progressStateObj.expertScore + progressStateObj.viewerScore
                                        : Number(matchingProgress.current_step || 0)))
                                : (typeof progressStateObj.currentIndex === 'number' 
                                    ? progressStateObj.currentIndex 
                                    : Number(matchingProgress.current_step || 0)))
                            : (pack.current_step !== undefined ? Number(pack.current_step) : 0);

                          const mpMyRound = isMp
                            ? Math.max(1, Math.min(totalSteps, Number(pack.mp_my_round || matchingProgress?.mp_my_round || (rawCurrentStep + 1)) || 1))
                            : Math.max(1, Math.min(totalSteps, rawCurrentStep + 1));
                          const currentStep = isMp
                            ? (mpMyFinished || mpStatus === 'finished' ? totalSteps : Math.max(rawCurrentStep, mpMyRound - 1))
                            : rawCurrentStep;

                          const hasCompletedSession = Boolean(pack.has_completed_session) || gameHistory.some((s: any) => 
                            s && (s.pack_id === pack.id || s.packId === pack.id || s.id === pack.id)
                          );

                          // Active in-progress determination
                          const hasActiveUnfinishedProgress = isMp
                            ? mpStatus !== 'finished'
                            : (!!matchingProgress && 
                                Number(matchingProgress.is_completed || 0) === 0 && 
                                currentStep > 0 && 
                                currentStep < totalSteps);

                          const isCompleted = isMp
                            ? mpStatus === 'finished'
                            : ((hasCompletedSession && !hasActiveUnfinishedProgress) ||
                                (matchingProgress ? Number(matchingProgress.is_completed || 0) === 1 : false) ||
                                (currentStep >= totalSteps && totalSteps > 0) ||
                                (pack.is_completed === true && !hasActiveUnfinishedProgress) ||
                                (!matchingProgress && (hasCompletedSession || (Number(pack.play_count || 0) > 0 && !pack.is_unfinished))));

                          const isUnfinished = isMp ? mpStatus !== 'finished' : (!isCompleted && hasActiveUnfinishedProgress);
                          const actualCurrentStep = isUnfinished ? currentStep : totalSteps;
                          const progressPercent = Math.min(100, Math.round((actualCurrentStep / Math.max(1, totalSteps)) * 100));

                          return (
                            <div 
                              key={`pack-${pack.id || packIdx}-${packIdx}`} 
                              className="p-3.5 sm:p-5 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl hover:border-primary/45 transition-all flex flex-col justify-between gap-3.5 sm:gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.37)] group overflow-hidden min-w-0"
                            >
                              <div className="space-y-3">
                                {/* Title, Pack ID, and Status Badge */}
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-black text-sm text-primary">
                                          {gameTitle}
                                        </span>
                                        {isMp ? (
                                          <BubbleElement size="sm" isBadge active className="!px-2.5 !py-0.5 !text-sm">
                                            Мультиплеер
                                          </BubbleElement>
                                        ) : (
                                          <BubbleElement size="sm" isBadge className="!px-2.5 !py-0.5 !text-sm border-primary/30 text-foreground/80">
                                            Одиночная
                                          </BubbleElement>
                                        )}
                                      </div>
                                      <p className="text-sm font-semibold text-foreground/60 mt-1">
                                        {pack.difficulty ? getDifficultyLabel(pack.difficulty) : 'ИИкра'} • {totalSteps} вопр.
                                      </p>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
                                      {isMp ? (
                                        mpStatus === 'finished' ? (
                                          <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold border-primary/35 text-primary whitespace-nowrap">
                                            Завершена
                                          </BubbleElement>
                                        ) : mpStatus === 'waiting' ? (
                                          <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold border-amber-500/35 text-amber-300 whitespace-nowrap">
                                            Запуск
                                          </BubbleElement>
                                        ) : (mpMyFinished || (mpFinishRemainingSec !== null && mpFinishRemainingSec > 0 && mpFinishRemainingSec <= 300)) ? (
                                          <BubbleElement size="sm" isBadge active className="px-3 py-1 text-sm font-bold whitespace-nowrap">
                                            На финише{mpTimerStr ? ` (${mpTimerStr})` : ''}
                                          </BubbleElement>
                                        ) : (
                                          <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold border-primary/40 text-primary whitespace-nowrap">
                                            Идет игра ({mpMyRound}/{totalSteps})
                                          </BubbleElement>
                                        )
                                      ) : isUnfinished ? (
                                        <BubbleElement 
                                          size="sm" 
                                          isBadge 
                                          className="px-3 py-1 text-sm font-bold border-amber-500/35 text-amber-300 whitespace-nowrap"
                                        >
                                          В процессе ({actualCurrentStep}/{totalSteps})
                                        </BubbleElement>
                                      ) : (
                                        <BubbleElement 
                                          size="sm" 
                                          isBadge 
                                          className="px-3 py-1 text-sm font-bold border-primary/35 text-primary whitespace-nowrap"
                                        >
                                          Завершена
                                        </BubbleElement>
                                      )}
                                    </div>
                                  </div>

                                  {pack.id && (
                                    <div>
                                      <BubbleElement
                                        size="sm"
                                        isBadge
                                        className="!px-2.5 !py-0.5 !text-sm font-mono font-bold text-foreground/70 max-w-full"
                                        title={`id пака: ${pack.id}`}
                                      >
                                        <span className="whitespace-normal break-all text-left">
                                          id: {pack.id}
                                        </span>
                                      </BubbleElement>
                                    </div>
                                  )}
                                </div>

                                {/* Topic */}
                                <div>
                                  <p className="text-sm font-bold text-foreground line-clamp-2">
                                    {displayTopic}
                                  </p>
                                </div>

                                {/* Progress Bar if unfinished */}
                                {isUnfinished && (
                                  <div className="space-y-1.5 p-2.5 rounded-2xl bg-transparent backdrop-blur-md border border-amber-500/20">
                                    <div className="flex items-center justify-between text-sm font-semibold text-foreground/70">
                                      <span>{isMp ? (mpMyFinished ? 'Статус мультиплеера:' : 'Текущий вопрос:') : 'Прогресс прохождения:'}</span>
                                      <span className="font-black text-amber-300">
                                        {isMp
                                          ? (mpMyFinished
                                              ? `Вы финишировали${mpTimerStr ? ` (${mpTimerStr})` : ' (ждём остальных)'}`
                                              : `Вопрос ${mpMyRound} из ${totalSteps}`)
                                          : `${actualCurrentStep} из ${totalSteps} (${progressPercent}%)`}
                                      </span>
                                    </div>
                                    <div className="w-full h-1.5 rounded-full bg-transparent border border-amber-500/25 overflow-hidden">
                                      <div 
                                        className="h-full bg-amber-400 rounded-full transition-all duration-500"
                                        style={{ width: `${progressPercent}%` }}
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center gap-2 text-sm text-foreground/60">
                                  <span>{dateStr}</span>
                                  <span>•</span>
                                  <span>Сыграно: {pack.play_count || 1} раз</span>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className={`pt-3 border-t border-primary/15 grid ${isUnfinished || isMp ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 sm:gap-2 min-w-0`}>
                                {/* Button 1: Посмотреть вопросы */}
                                <BubbleElement
                                  size="sm"
                                  onClick={() => setSelectedPackForQuestions({ pack, progress: matchingProgress })}
                                  icon={<HelpCircle size={14} className="text-primary shrink-0" />}
                                  className="w-full justify-center text-sm !px-1.5 sm:!px-3 !py-1.5 !gap-1 sm:!gap-1.5 rounded-2xl min-w-0"
                                  title="Посмотреть список сыгранных вопросов и ответов"
                                >
                                  <span className="leading-tight line-clamp-2">Вопросы</span>
                                </BubbleElement>

                                {/* Button 2: Войти / Продолжить / Ждать / Результаты */}
                                {isMp ? (
                                  <BubbleElement
                                    size="sm"
                                    onClick={() =>
                                      handleResumeProgress(
                                        matchingProgress || pack,
                                        pack,
                                        !mpMyFinished && mpStatus !== 'waiting' ? Math.max(0, mpMyRound - 1) : undefined
                                      )
                                    }
                                    icon={<Play size={14} className="shrink-0 text-amber-300" />}
                                    className="w-full justify-center text-sm !px-1.5 sm:!px-3 !py-1.5 !gap-1 sm:!gap-1.5 rounded-2xl border-amber-500/40 text-amber-300 min-w-0"
                                    title={
                                      mpStatus === 'waiting'
                                        ? 'Войти в лобби запуска мультиплеера'
                                        : mpMyFinished && mpStatus === 'finished'
                                        ? 'Посмотреть результаты мультиплеера в лобби'
                                        : mpMyFinished
                                        ? 'Ждать завершения остальных игроков в лобби'
                                        : `Продолжить мультиплеер на вопросе ${mpMyRound}`
                                    }
                                  >
                                    {mpStatus === 'waiting' ? (
                                      <span className="leading-tight line-clamp-2">Войти</span>
                                    ) : mpMyFinished && mpStatus === 'finished' ? (
                                      <>
                                        <span className="sm:hidden leading-tight line-clamp-2">Итоги</span>
                                        <span className="hidden sm:inline leading-tight">Результаты</span>
                                      </>
                                    ) : mpMyFinished ? (
                                      <span className="leading-tight line-clamp-2">Ждать</span>
                                    ) : (
                                      <>
                                        <span className="sm:hidden leading-tight line-clamp-2">Дальше</span>
                                        <span className="hidden sm:inline leading-tight">Продолжить ({mpMyRound})</span>
                                      </>
                                    )}
                                  </BubbleElement>
                                ) : isUnfinished ? (
                                  <BubbleElement
                                    size="sm"
                                    onClick={() => handleResumeProgress(matchingProgress, pack)}
                                    icon={<Play size={14} className="shrink-0 text-amber-300" />}
                                    className="w-full justify-center text-sm !px-1.5 sm:!px-3 !py-1.5 !gap-1 sm:!gap-1.5 rounded-2xl border-amber-500/40 text-amber-300 min-w-0"
                                    title="Продолжить одиночную игру с незавершенного шага"
                                  >
                                    <span className="sm:hidden leading-tight line-clamp-2">Дальше</span>
                                    <span className="hidden sm:inline leading-tight">Продолжить</span>
                                  </BubbleElement>
                                ) : null}

                                {/* Button 3: В Одиночку (for multiplayer packs) / Заново (for solo packs) */}
                                <LeafButton
                                  variant="primary"
                                  size="sm"
                                  disabled={launchingPackId === pack.id}
                                  onClick={() => handlePlayPack(pack)}
                                  icon={
                                    launchingPackId === pack.id ? (
                                      <Loader2 size={14} className="shrink-0 animate-spin" />
                                    ) : (
                                      <RotateCcw size={14} className="shrink-0" />
                                    )
                                  }
                                  className="w-full justify-center text-sm !px-1.5 sm:!px-3.5 !py-1.5 min-w-0"
                                  title={isMp ? 'Запустить эту игру в одиночном режиме' : 'Запустить эту игру заново сначала без новой генерации'}
                                >
                                  {isMp ? (
                                    <>
                                      <span className="sm:hidden leading-tight line-clamp-2">Соло</span>
                                      <span className="hidden sm:inline leading-tight">В Одиночку</span>
                                    </>
                                  ) : (
                                    <span className="leading-tight line-clamp-2">Заново</span>
                                  )}
                                </LeafButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Infinite scroll sentinel & manual batch trigger for Saved Packs */}
                      <div ref={packsSentinelRef} className="flex flex-col items-center gap-3 pt-2">
                        {loadingMorePacks ? (
                          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground/80">
                            <Loader2 size={16} className="animate-spin text-primary" />
                            <span>Загрузка следующей пачки...</span>
                          </div>
                        ) : hasMorePacks ? (
                          <BubbleElement
                            size="sm"
                            onClick={loadMorePacks}
                            icon={<ChevronDown size={16} />}
                            className="px-4 py-2 text-sm"
                          >
                            Загрузить ещё ({sortedPacks.length} из {packsTotalCount || sortedPacks.length})
                          </BubbleElement>
                        ) : null}
                      </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-foreground/40 rounded-3xl border border-primary/15 bg-background/15 text-center p-6 backdrop-blur-md">
                        <Gamepad2 size={36} className="mb-2 text-primary opacity-60" />
                        <p className="text-sm font-bold text-foreground/80">Сохраненные игры не найдены</p>
                        <p className="text-sm text-foreground/50 mt-1 max-w-sm">
                          Каждая сгенерированная вами игра автоматически сохраняется здесь, чтобы вы могли сыграть в неё снова в любой момент без ожидания!
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW 2: ACTIVE IN-PROGRESS GAMES (game_progress) */}
                {historySubTab === 'progress' && (
                  <div className="space-y-4">
                    {loadingHistory ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="animate-spin text-primary" size={32} />
                      </div>
                    ) : sortedProgress.length > 0 ? (
                      <>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {sortedProgress.map((prog: any, progIdx: number) => {
                          const progCreatedTime = getItemCreatedAt(prog);
                          const dateStr = progCreatedTime > 0
                            ? new Date(progCreatedTime).toLocaleDateString('ru-RU', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : '—';
                          const gameTitle = resolveItemGameTitle(prog);
                          const displayTopic = resolveItemTopic(prog);

                          const isProgMp = Boolean(prog.is_multiplayer || prog.mp_room_id);
                          const progMpStatus = prog.mp_status || (isProgMp ? 'active' : null);
                          const progMpMyFinished = Boolean(prog.mp_my_finished);
                          const progMpTimerStr = formatMpCountdownSec(prog.mp_finish_remaining_seconds);
                          const total = prog.total_steps || 10;
                          const progMpRound = isProgMp
                            ? Math.max(1, Math.min(total, Number(prog.mp_my_round || ((prog.current_step || 0) + 1)) || 1))
                            : Math.max(1, Math.min(total, (prog.current_step || 0) + 1));
                          const current = isProgMp
                            ? (progMpMyFinished ? total : Math.max(prog.current_step || 0, progMpRound - 1))
                            : (prog.current_step || 0);
                          const progressPercent = Math.min(100, Math.round((current / (total || 1)) * 100));

                          return (
                            <div 
                              key={`prog-${prog.id || progIdx}-${progIdx}`} 
                              className="p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl hover:border-primary/50 transition-all flex flex-col justify-between gap-4 group shadow-[0_8px_32px_rgba(0,0,0,0.37)] overflow-hidden"
                            >
                              <div className="space-y-3">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-extrabold text-sm text-primary">
                                          {gameTitle}
                                        </span>
                                        {isProgMp ? (
                                          <BubbleElement size="sm" isBadge active className="!px-2.5 !py-0.5 !text-sm">
                                            Мультиплеер
                                          </BubbleElement>
                                        ) : (
                                          <BubbleElement size="sm" isBadge className="!px-2.5 !py-0.5 !text-sm border-primary/30 text-foreground/80">
                                            Одиночная
                                          </BubbleElement>
                                        )}
                                      </div>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1.5">
                                      {isProgMp ? (
                                        progMpStatus === 'waiting' ? (
                                          <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold border-amber-500/35 text-amber-300 whitespace-nowrap">
                                            Запуск
                                          </BubbleElement>
                                        ) : (progMpMyFinished || (typeof prog.mp_finish_remaining_seconds === 'number' && prog.mp_finish_remaining_seconds > 0 && prog.mp_finish_remaining_seconds <= 300)) ? (
                                          <BubbleElement size="sm" isBadge active className="px-3 py-1 text-sm font-bold whitespace-nowrap">
                                            На финише{progMpTimerStr ? ` (${progMpTimerStr})` : ''}
                                          </BubbleElement>
                                        ) : (
                                          <BubbleElement size="sm" isBadge className="px-3 py-1 text-sm font-bold border-primary/40 text-primary whitespace-nowrap">
                                            Идет игра ({progMpRound}/{total})
                                          </BubbleElement>
                                        )
                                      ) : (
                                        <BubbleElement 
                                          size="sm" 
                                          isBadge 
                                          className="px-3 py-1 text-sm font-bold border-amber-500/30 text-amber-400 whitespace-nowrap"
                                        >
                                          В процессе
                                        </BubbleElement>
                                      )}
                                    </div>
                                  </div>

                                  {prog.pack_id && (
                                    <div>
                                      <BubbleElement
                                        size="sm"
                                        isBadge
                                        className="!px-2.5 !py-0.5 !text-sm font-mono font-bold text-foreground/70 max-w-full"
                                        title={`id пака: ${prog.pack_id}`}
                                      >
                                        <span className="whitespace-normal break-all text-left">
                                          id: {prog.pack_id}
                                        </span>
                                      </BubbleElement>
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <p className="text-sm font-bold text-foreground line-clamp-2">
                                    {displayTopic}
                                  </p>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between text-sm font-medium text-foreground/70">
                                    <span>{isProgMp ? 'Прогресс в мультиплеере:' : 'Пройдено вопросов:'}</span>
                                    <span className="text-primary font-bold">
                                      {isProgMp && progMpMyFinished
                                        ? `Вы завершили (ждём остальных${progMpTimerStr ? ` ${progMpTimerStr}` : ''})`
                                        : `${current} из ${total} (Текущий: ${isProgMp ? progMpRound : Math.min(current + 1, total)})`}
                                    </span>
                                  </div>
                                  <div className="w-full h-2 rounded-full bg-transparent border border-primary/20 overflow-hidden">
                                    <div 
                                      className="h-full bg-primary rounded-full transition-all duration-500"
                                      style={{ width: `${progressPercent}%` }}
                                    />
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-sm text-foreground/60">
                                  <span>Сохранено: {dateStr}</span>
                                  {prog.difficulty && (
                                    <span>Сложность: {getDifficultyLabel(prog.difficulty)}</span>
                                  )}
                                </div>
                              </div>

                              <div className="pt-3 border-t border-primary/15 grid grid-cols-2 gap-1.5 sm:gap-2 min-w-0">
                                <BubbleElement
                                  size="sm"
                                  onClick={() => handleDeleteProgress(prog.id)}
                                  icon={<Trash2 size={14} className="shrink-0 text-rose-400" />}
                                  className="w-full justify-center border-rose-500/30 text-rose-400 text-sm !px-2 sm:!px-3 !py-1.5 !gap-1 sm:!gap-1.5 rounded-2xl min-w-0"
                                  title="Удалить прогресс"
                                >
                                  <span className="leading-tight line-clamp-2">Сбросить</span>
                                </BubbleElement>

                                <LeafButton
                                  variant="primary"
                                  size="sm"
                                  onClick={() =>
                                    handleResumeProgress(
                                      prog,
                                      undefined,
                                      isProgMp && !progMpMyFinished && progMpStatus !== 'waiting'
                                        ? Math.max(0, progMpRound - 1)
                                        : undefined
                                    )
                                  }
                                  icon={<Gamepad2 size={14} className="shrink-0" />}
                                  className="w-full justify-center text-sm !px-2 sm:!px-3.5 !py-1.5 min-w-0"
                                >
                                  {isProgMp ? (
                                    progMpStatus === 'waiting' ? (
                                      <span className="leading-tight line-clamp-2">Войти</span>
                                    ) : progMpMyFinished ? (
                                      <span className="leading-tight line-clamp-2">Ждать</span>
                                    ) : (
                                      <>
                                        <span className="sm:hidden leading-tight line-clamp-2">Дальше ({progMpRound})</span>
                                        <span className="hidden sm:inline leading-tight">Продолжить (вопр. {progMpRound})</span>
                                      </>
                                    )
                                  ) : (
                                    <>
                                      <span className="sm:hidden leading-tight line-clamp-2">Дальше</span>
                                      <span className="hidden sm:inline leading-tight">Продолжить</span>
                                    </>
                                  )}
                                </LeafButton>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Infinite scroll sentinel & manual batch trigger for In-Progress Games */}
                      <div ref={progressSentinelRef} className="flex flex-col items-center gap-3 pt-2">
                        {loadingMoreProgress ? (
                          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl text-sm text-foreground/80">
                            <Loader2 size={16} className="animate-spin text-primary" />
                            <span>Загрузка следующей пачки...</span>
                          </div>
                        ) : hasMoreProgress ? (
                          <BubbleElement
                            size="sm"
                            onClick={loadMoreProgress}
                            icon={<ChevronDown size={16} />}
                            className="px-4 py-2 text-sm"
                          >
                            Загрузить ещё ({sortedProgress.length} из {progressTotalCount || sortedProgress.length})
                          </BubbleElement>
                        ) : null}
                      </div>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-foreground/40 rounded-3xl border border-primary/15 bg-background/15 text-center p-6 backdrop-blur-md">
                        <Clock size={36} className="mb-2 text-primary opacity-60" />
                        <p className="text-sm font-bold text-foreground/80">Нет незавершенных игр</p>
                        <p className="text-sm text-foreground/50 mt-1 max-w-sm">
                          Если вы начнете игру и решите прерваться, ваш текущий прогресс и раунд сохранятся здесь автоматически.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* VIEW 3: PLAYED SESSIONS & BUBBLE CHARTS */}
                {historySubTab === 'sessions' && (
                  <div className="space-y-6">
                    {/* Informative Explanation Banner */}
                    <div className="p-4 rounded-3xl border border-primary/20 bg-background/25 backdrop-blur-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20 text-primary shrink-0 mt-0.5">
                          <History size={20} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-foreground">
                            Что такое статистика и сессии игры?
                          </p>
                          <p className="text-sm text-foreground/70 leading-relaxed">
                            Игровые сессии — это архив ваших завершенных партий. Здесь сохраняются финальный счет, винрейт и точность ответов. 
                            {filteredProgress.length > 0 && ` У вас сейчас ${filteredProgress.length} незавершенных партий на паузе — завершите их, чтобы они добавились в статистику.`}
                          </p>
                        </div>
                      </div>
                      {filteredProgress.length > 0 && (
                        <LeafButton
                          variant="primary"
                          size="sm"
                          onClick={() => setHistorySubTab('progress')}
                          className="shrink-0 whitespace-nowrap"
                        >
                          К незавершенным ({filteredProgress.length})
                        </LeafButton>
                      )}
                    </div>

                    {/* Key Metrics Stats Grid */}
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
                      <div className="p-4 rounded-3xl border border-primary/20 bg-background/25 backdrop-blur-xl shadow-lg">
                        <p className="text-sm font-semibold text-foreground/70">Сыграно сессий</p>
                        <p className="text-2xl font-black text-foreground mt-1">{totalFiltered}</p>
                      </div>

                      <div className="p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl shadow-lg">
                        <p className="text-sm font-semibold text-foreground/70">Побед</p>
                        <p className="text-2xl font-black text-emerald-400 mt-1">{winsFiltered}</p>
                      </div>

                      <div className="p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl shadow-lg">
                        <p className="text-sm font-semibold text-foreground/70">Винрейт</p>
                        <p className="text-2xl font-black text-primary mt-1">{winRateFiltered}%</p>
                      </div>

                      <div 
                        onClick={() => navigate('/profile/exchange')}
                        className="p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl shadow-lg cursor-pointer hover:border-primary/50 transition-all hover:scale-[1.02] group"
                        title="Перейти в магазин и обмен очков"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground/70 group-hover:text-primary transition-colors">Всего очков</p>
                          <BubbleElement isBadge size="sm" className="!text-sm">
                            Магазин
                          </BubbleElement>
                        </div>
                        <p className="text-2xl font-black text-primary mt-1">{totalScoreFiltered.toLocaleString('ru-RU')}</p>
                      </div>

                      <div className="p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl shadow-lg col-span-2 sm:col-span-1">
                        <p className="text-sm font-semibold text-foreground/70">Средний счет</p>
                        <p className="text-2xl font-black text-foreground mt-1">{avgScoreFiltered.toLocaleString('ru-RU')}</p>
                      </div>
                    </div>

                    {/* Circular Bubble Conversion Charts Grid (3 bubbles) */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {/* Bubble 1: Win Rate Conversion */}
                      <div className="relative p-5 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-xl flex flex-col items-center text-center shadow-[0_8px_32px_rgba(0,0,0,0.37)] overflow-hidden group hover:border-primary/45 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-primary/15 blur-2xl pointer-events-none group-hover:bg-primary/25 transition-all" />
                        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

                        <span className="text-sm font-bold text-foreground/90 mb-3 z-10">Конверсия побед</span>
                        
                        {/* Specular Bubble Core */}
                        <div className="relative w-36 h-36 flex items-center justify-center z-10">
                          <div className="absolute w-24 h-24 rounded-full border border-white/25 bg-gradient-to-b from-white/15 via-primary/5 to-transparent backdrop-blur-md shadow-[inset_0_2px_8px_rgba(255,255,255,0.25),0_0_20px_rgba(153,208,55,0.2)] flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-black text-primary drop-shadow-[0_0_10px_rgba(153,208,55,0.6)]">
                              {winRateFiltered}%
                            </span>
                            <span className="text-sm font-bold text-foreground/70">винрейт</span>
                          </div>

                          <PieChart width={144} height={144}>
                            <Pie
                              data={totalFiltered > 0 ? winrateData : [{ name: 'Нет данных', value: 1, color: '#334155' }]}
                              cx="50%"
                              cy="50%"
                              innerRadius={46}
                              outerRadius={62}
                              paddingAngle={3}
                              dataKey="value"
                              stroke="transparent"
                            >
                              {(totalFiltered > 0 ? winrateData : [{ name: 'Нет данных', value: 1, color: '#334155' }]).map((entry, index) => (
                                <Cell key={`cell-win-${entry.name}-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-sm mt-3 z-10">
                          <span className="flex items-center gap-1 text-emerald-400 font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#10b981]" /> {winsFiltered} побед
                          </span>
                          <span className="flex items-center gap-1 text-rose-400 font-bold px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block shadow-[0_0_6px_#f43f5e]" /> {lossesFiltered} пораж.
                          </span>
                        </div>
                      </div>

                      {/* Bubble 2: Game Types Distribution */}
                      <div className="relative p-5 rounded-3xl border border-primary/25 bg-background/20 backdrop-blur-xl flex flex-col items-center text-center shadow-[0_8px_32px_rgba(0,0,0,0.37)] overflow-hidden group hover:border-primary/45 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-sky-500/15 blur-2xl pointer-events-none group-hover:bg-sky-500/25 transition-all" />
                        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />

                        <span className="text-sm font-bold text-foreground/90 mb-3 z-10">Распределение по играм</span>

                        {/* Specular Bubble Core */}
                        <div className="relative w-36 h-36 flex items-center justify-center z-10">
                          <div className="absolute w-24 h-24 rounded-full border border-white/25 bg-gradient-to-b from-white/15 via-sky-500/10 to-transparent backdrop-blur-md shadow-[inset_0_2px_8px_rgba(255,255,255,0.25),0_0_20px_rgba(56,189,248,0.2)] flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-black text-foreground">
                              {totalFiltered}
                            </span>
                            <span className="text-sm font-bold text-foreground/70">партий</span>
                          </div>

                          <PieChart width={144} height={144}>
                            <Pie
                              data={gameDistributionData.length > 0 ? gameDistributionData : [{ name: 'Нет игр', value: 1 }]}
                              cx="50%"
                              cy="50%"
                              innerRadius={46}
                              outerRadius={62}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="transparent"
                            >
                              {gameDistributionData.map((entry, index) => (
                                <Cell key={`cell-dist-${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                              ))}
                            </Pie>
                          </PieChart>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm mt-3 max-h-16 overflow-y-auto z-10">
                          {gameDistributionData.map((item, itemIdx) => (
                            <span key={`gdist-${item.name}-${itemIdx}`} className="px-2.5 py-1 rounded-full bg-background/50 border border-primary/20 font-bold text-foreground/80">
                              {item.name}: {item.value}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Bubble 3: Accuracy Conversion */}
                      <div className="relative p-5 rounded-3xl border border-primary/25 bg-background/20 backdrop-blur-xl flex flex-col items-center text-center shadow-[0_8px_32px_rgba(0,0,0,0.37)] overflow-hidden group hover:border-primary/45 transition-all">
                        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-amber-500/15 blur-2xl pointer-events-none group-hover:bg-amber-500/25 transition-all" />
                        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />

                        <span className="text-sm font-bold text-foreground/90 mb-3 z-10">Точность ответов</span>

                        {/* Specular Bubble Core */}
                        <div className="relative w-36 h-36 flex items-center justify-center z-10">
                          <div className="absolute w-24 h-24 rounded-full border border-white/25 bg-gradient-to-b from-white/15 via-amber-500/10 to-transparent backdrop-blur-md shadow-[inset_0_2px_8px_rgba(255,255,255,0.25),0_0_20px_rgba(245,158,11,0.2)] flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-black text-primary drop-shadow-[0_0_10px_rgba(153,208,55,0.6)]">
                              {accuracyRate}%
                            </span>
                            <span className="text-sm font-bold text-foreground/70">точность</span>
                          </div>

                          <PieChart width={144} height={144}>
                            <Pie
                              data={totalQuestionsAnswered > 0 ? accuracyData : [{ name: 'Нет данных', value: 1, color: '#334155' }]}
                              cx="50%"
                              cy="50%"
                              innerRadius={46}
                              outerRadius={62}
                              paddingAngle={3}
                              dataKey="value"
                              stroke="transparent"
                            >
                              {(totalQuestionsAnswered > 0 ? accuracyData : [{ name: 'Нет данных', value: 1, color: '#334155' }]).map((entry, index) => (
                                <Cell key={`cell-acc-${entry.name}-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </div>

                        <div className="flex items-center justify-center gap-2 text-sm mt-3 z-10">
                          <span className="flex items-center gap-1 text-emerald-400 font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_#10b981]" /> {totalCorrectAnswers} прав.
                          </span>
                          <span className="flex items-center gap-1 text-rose-400 font-bold px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block shadow-[0_0_6px_#f43f5e]" /> {totalIncorrectAnswers} ошиб.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Session Cards List */}
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-foreground">
                          Список сыгранных сессий ({sessionsTotalCount || filteredSessions.length})
                        </h4>
                      </div>

                      {loadingHistory || loadingSessionsPage ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="animate-spin text-primary" size={32} />
                        </div>
                      ) : paginatedSessions.length > 0 ? (
                        <div className="space-y-4">
                          <div className="grid gap-3">
                            {paginatedSessions.map((session: any, sIdx: number) => {
                              const isWin = session.is_win || session.result === 'win';
                              const scoreVal = session.score !== undefined ? session.score : 0;
                              const dateStr = new Date(session.created_at || session.completed_at || 0).toLocaleString('ru-RU');

                              const rawTitle = session.game_title && session.game_title !== 'Игра Квайз' && session.game_title !== 'unknown' 
                                ? session.game_title 
                                : (session.game_id || 'blitz');
                              const displayGameTitle = resolveItemGameTitle(session);
                              const displayTopic = resolveItemTopic(session);

                              return (
                                <div 
                                  key={`session-${session.id || sIdx}-${sIdx}`} 
                                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-3xl border border-primary/20 bg-background/20 backdrop-blur-xl hover:bg-primary/5 transition-all gap-4 shadow-lg"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-sm text-foreground">
                                        {displayGameTitle}
                                      </span>
                                      {(session.pack_id || session.packId) && (
                                        <span className="text-xs px-2 py-0.5 rounded-lg bg-background/50 border border-primary/20 text-foreground/70 font-mono font-bold" title={`ID пака: ${session.pack_id || session.packId}`}>
                                          ID: {session.pack_id || session.packId}
                                        </span>
                                      )}
                                      <span className={`px-2.5 py-1 rounded-full text-sm font-bold border ${
                                        isWin 
                                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                      }`}>
                                        {isWin ? 'Победа' : 'Завершено'}
                                      </span>
                                      {session.difficulty && (
                                        <span className="px-2.5 py-1 rounded-xl bg-background/30 text-foreground/70 text-sm border border-primary/10 font-medium">
                                          {getDifficultyLabel(session.difficulty)}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/70">
                                      <span>{dateStr}</span>
                                      {displayTopic && (
                                        <span className="text-primary font-medium">Тема: {displayTopic}</span>
                                      )}
                                      {session.correct_answers !== undefined && (
                                        <span>Верно: {session.correct_answers} из {session.total_questions || 10}</span>
                                      )}
                                    </div>

                                    {/* 100 to 1 specific rounds breakdown */}
                                    {(session.game_id === '100to1' || rawTitle === '100to1' || String(session.game_title || '').includes('100') || String(session.game_title || '').includes('Сто')) && (session.rounds_won !== undefined || session.round_results) && (() => {
                                      let parsedRounds: any[] = [];
                                      if (typeof session.round_results === 'string') {
                                        try {
                                          parsedRounds = JSON.parse(session.round_results);
                                        } catch (_) {
                                          parsedRounds = [];
                                        }
                                      } else if (Array.isArray(session.round_results)) {
                                        parsedRounds = session.round_results;
                                      }
                                      return (
                                        <div className="flex items-center gap-2 flex-wrap pt-1 text-sm">
                                          <span className="font-bold text-foreground/80">Туры:</span>
                                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                                            {session.rounds_won ?? 0} побед
                                          </span>
                                          <span className="px-2 py-0.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold">
                                            {session.rounds_lost ?? (4 - (session.rounds_won ?? 0))} пораж.
                                          </span>
                                          {parsedRounds.length > 0 && (
                                            <div className="flex items-center gap-1.5 ml-1">
                                              {parsedRounds.map((rr: any, rIdx: number) => {
                                                const isRoundWin = rr.is_win !== undefined ? Boolean(rr.is_win) : Boolean(rr.isWin);
                                                const roundNum = rr.round || (rIdx + 1);
                                                const roundPts = rr.score !== undefined ? rr.score : (rr.playerScore !== undefined ? rr.playerScore * 100 : 0);
                                                return (
                                                  <span
                                                    key={`rres-${session.id || sIdx}-${rIdx}`}
                                                    className={`px-2 py-0.5 rounded-md font-bold text-sm border ${
                                                      isRoundWin 
                                                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' 
                                                        : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                                                    }`}
                                                    title={`Тур ${roundNum}: ${isRoundWin ? 'Победа' : 'Поражение'} (+${Number(roundPts).toLocaleString('ru-RU')} очков)`}
                                                  >
                                                    Т{roundNum}: {isRoundWin ? 'В' : 'П'}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-primary/10">
                                    <div className="text-left sm:text-right">
                                      <p className="text-sm text-foreground/60 font-semibold">Результат</p>
                                      <p className="text-lg font-black text-primary font-mono">{Number(scoreVal).toLocaleString('ru-RU')} очков</p>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Pagination Bar (10 games per page fetched sequentially on page turn) */}
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-3xl border border-primary/20 bg-transparent backdrop-blur-xl">
                            <span className="text-sm text-foreground/70">
                              Показано {sessionsTotalCount === 0 ? 0 : (currentSessionsPage - 1) * SESSIONS_PER_PAGE + 1}–{Math.min((currentSessionsPage - 1) * SESSIONS_PER_PAGE + paginatedSessions.length, sessionsTotalCount || paginatedSessions.length)} из {sessionsTotalCount || paginatedSessions.length} сессий (по {SESSIONS_PER_PAGE} на странице)
                            </span>

                            <div className="flex items-center gap-2">
                              <LeafButton
                                variant="glass"
                                size="sm"
                                disabled={currentSessionsPage <= 1 || loadingSessionsPage}
                                onClick={() => goToSessionsPage(currentSessionsPage - 1)}
                                icon={<ChevronLeft size={16} />}
                              >
                                Назад
                              </LeafButton>

                              <span className="px-3 py-1.5 rounded-2xl bg-transparent border border-primary/20 text-sm font-bold text-primary font-mono backdrop-blur-md">
                                {currentSessionsPage} / {totalSessionsPages}
                              </span>

                              <LeafButton
                                variant="glass"
                                size="sm"
                                disabled={currentSessionsPage >= totalSessionsPages || loadingSessionsPage}
                                onClick={() => goToSessionsPage(currentSessionsPage + 1)}
                                icon={<ChevronRight size={16} />}
                              >
                                Вперед
                              </LeafButton>
                            </div>
                          </div>
                        </div>
                      ) : filteredProgress.length > 0 ? (
                        <div className="space-y-4">
                          <div className="flex flex-col items-center justify-center py-8 text-foreground/70 rounded-3xl border border-primary/20 bg-background/20 text-center p-6 backdrop-blur-xl">
                            <Clock size={36} className="mb-2 text-primary opacity-80" />
                            <p className="text-sm font-bold text-foreground">Завершенных сессий пока нет, но у вас есть {filteredProgress.length} незавершенных партий на паузе</p>
                            <p className="text-sm text-foreground/70 mt-1 max-w-md">
                              Завершите партию, чтобы зафиксировать победу или поражение в статистике сессий.
                            </p>
                          </div>

                          <div className="grid gap-3">
                            <p className="text-sm font-bold text-foreground">Ваши активные партии:</p>
                            {sortedProgress.slice(0, 5).map((progress: any, pIdx: number) => {
                              let stateObj: any = {};
                              try {
                                stateObj = typeof progress.state === 'string' ? JSON.parse(progress.state) : (progress.state || {});
                              } catch {
                                stateObj = {};
                              }

                              const gameId = progress.game_type || progress.game_id || stateObj.gameType || 'blitz';
                              const titles: Record<string, string> = {
                                blitz: 'КвИИз',
                                millionaire: 'Квиллионер',
                                '100to1': 'Сто Квадному',
                                jeopardy: 'Своя Икра',
                                alias: 'ИИлиас',
                                whatwherewhen: 'Что? Где? Квада?',
                                melody: 'Угадай мелодию',
                                duel: 'ИИ Дуэль',
                                fact: 'Правда или ИИ',
                                chronos: 'Хронос'
                              };
                              const gameTitle = titles[gameId] || progress.game_title || 'Игра';
                              const topic = progress.topic || stateObj.topic || (stateObj.topics && stateObj.topics.join(', ')) || 'Общая';
                              
                              const answeredCount = typeof stateObj.currentIndex === 'number' 
                                ? stateObj.currentIndex 
                                : (typeof stateObj.currentQuestionIndex === 'number' ? stateObj.currentQuestionIndex : (progress.current_step || 0));
                              const totalQ = stateObj.questions?.length || progress.total_steps || 10;
                              const currentQ = Math.min(answeredCount + 1, totalQ);
                              const score = stateObj.score !== undefined ? stateObj.score : (stateObj.currentPrize || 0);

                              return (
                                <div
                                  key={`inprogress-${progress.id || pIdx}-${pIdx}`}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-3xl border border-primary/20 bg-background/20 backdrop-blur-xl gap-3"
                                >
                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="font-bold text-sm text-foreground">
                                        {gameTitle}
                                      </p>
                                      {progress.pack_id && (
                                        <span className="text-xs px-2 py-0.5 rounded-lg bg-background/50 border border-primary/20 text-foreground/70 font-mono font-bold" title={`ID пака: ${progress.pack_id}`}>
                                          ID: {progress.pack_id}
                                        </span>
                                      )}
                                      {topic && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium">
                                          {topic}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-foreground/70 mt-1">
                                      Сыграно: {answeredCount} из {totalQ} вопр. (текущий: {currentQ}) • Счет: {score} очков
                                    </p>
                                  </div>
                                  <LeafButton
                                    variant="primary"
                                    size="sm"
                                    onClick={() => handleResumeProgress(progress)}
                                    className="shrink-0"
                                  >
                                    <Play size={16} className="fill-current mr-1.5" />
                                    Продолжить игру
                                  </LeafButton>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-foreground/60 rounded-3xl border border-primary/15 bg-background/15 text-center p-6 backdrop-blur-md">
                          <History size={36} className="mb-2 text-primary opacity-60" />
                          <p className="text-sm font-bold text-foreground">Сессии не найдены</p>
                          <p className="text-sm text-foreground/70 mt-1 max-w-sm">
                            Сыграйте и завершите любую партию, чтобы здесь появилась подробная статистика.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ========================================================================= */}
          {/* 6. MULTIPLAYER TAB (/profile/multiplayer) */}
          {/* ========================================================================= */}
          {activeTab === 'multiplayer' && (
            <ProfileMultiplayerView />
          )}
        </div>
      </div>

      {/* Questions Modal for played questions */}
      {selectedPackForQuestions && (() => {
        const { pack, progress } = selectedPackForQuestions;
        const activeProgress = progress || gameProgressList.find((p: any) => p && (p.pack_id === pack.id || (pack.mp_room_id && p.mp_room_id === pack.mp_room_id)));
        const isModalMp = Boolean(pack.is_multiplayer || activeProgress?.is_multiplayer || pack.mp_room_id || activeProgress?.mp_room_id);
        const modalMpRoomId = pack.mp_room_id || activeProgress?.mp_room_id || null;
        const modalMpStatus = pack.mp_status || activeProgress?.mp_status || (isModalMp ? 'active' : null);
        const modalMpMyFinished = Boolean(pack.mp_my_finished || activeProgress?.mp_my_finished);
        const modalMpRemSec = typeof pack.mp_finish_remaining_seconds === 'number'
          ? pack.mp_finish_remaining_seconds
          : typeof activeProgress?.mp_finish_remaining_seconds === 'number'
          ? activeProgress.mp_finish_remaining_seconds
          : null;
        const modalMpTimerStr = formatMpCountdownSec(modalMpRemSec);
        const hasUnfinishedGame = isModalMp
          ? modalMpStatus !== 'finished'
          : (!!activeProgress && Number(activeProgress.is_completed || 0) === 0);

        let rawQuestions: any[] = [];
        if (activePackQuestions && activePackQuestions.length > 0) {
          rawQuestions = activePackQuestions;
        } else {
          try {
            if (Array.isArray(pack.questions)) {
              rawQuestions = pack.questions;
            } else if (typeof pack.questions === 'string') {
              rawQuestions = JSON.parse(pack.questions);
            } else if (activeProgress && activeProgress.state) {
              const parsedState = typeof activeProgress.state === 'string' ? JSON.parse(activeProgress.state) : activeProgress.state;
              if (Array.isArray(parsedState.questions)) {
                rawQuestions = parsedState.questions;
              }
            }
          } catch {
            rawQuestions = [];
          }
        }

        const sortedRaw = [...rawQuestions].sort((a: any, b: any) => {
          const aIdx = a.question_index !== undefined ? Number(a.question_index) : (a.order !== undefined ? Number(a.order) : 0);
          const bIdx = b.question_index !== undefined ? Number(b.question_index) : (b.order !== undefined ? Number(b.order) : 0);
          if (aIdx !== bIdx) return aIdx - bIdx;
          return String(a.id || '').localeCompare(String(b.id || ''));
        });

        // Build map of Jeopardy category & question state from activeProgress.state and pack.questions if available
        const localJeopardyMetaMap = new Map<number, any>();
        let localAllTopics: { name: string; description?: string }[] = [];
        try {
          if (Array.isArray(pack.questions)) {
            pack.questions.forEach((pq: any, i: number) => {
              const idxNum = Number(pq?.question_index) || (i + 1);
              localJeopardyMetaMap.set(idxNum, { ...pq });
            });
          }
          if (activeProgress?.state) {
            const st = typeof activeProgress.state === 'string' ? JSON.parse(activeProgress.state) : activeProgress.state;
            if (Array.isArray(st?.allTopics)) localAllTopics = st.allTopics;
            const ingestCats = (cList: any[], rNum: number) => {
              if (!Array.isArray(cList)) return;
              cList.forEach((c: any, cIdx: number) => {
                const cName = c?.name || c?.categoryName || '';
                const cDesc = c?.description || c?.categoryDescription || '';
                if (!Array.isArray(c?.questions)) return;
                c.questions.forEach((cq: any, qIdx: number) => {
                  const idxNum = Number(cq?.question_index) || ((rNum - 1) * 25 + cIdx * 5 + qIdx + 1);
                  const prev = localJeopardyMetaMap.get(idxNum) || {};
                  localJeopardyMetaMap.set(idxNum, {
                    ...prev,
                    ...cq,
                    round: rNum,
                    category: cq?.category || cName || prev.category,
                    category_description: cq?.category_description || cDesc || prev.category_description,
                    value: cq?.value ?? prev.value ?? ((qIdx + 1) * 100 * rNum)
                  });
                });
              });
            };
            if (st?.pastRoundsCategories && typeof st.pastRoundsCategories === 'object') {
              Object.entries(st.pastRoundsCategories).forEach(([rk, cl]) => ingestCats(cl as any[], Number(rk) || 1));
            }
            if (Array.isArray(st?.categories)) {
              ingestCats(st.categories, Number(st?.round) || 1);
            }
          }
        } catch (_) {}

        const questions = sortedRaw.map((q: any, i: number) => {
          const qIdxNum = Number(q.question_index) || (i + 1);
          const localMeta = localJeopardyMetaMap.get(qIdxNum) || {};
          const qText = q.question || q.text || localMeta.question || localMeta.text || q.prompt || `Вопрос №${i + 1}`;
          let opts: string[] = [];
          if (Array.isArray(q.options)) {
            opts = q.options;
          } else if (q.options_json) {
            try {
              const parsed = JSON.parse(q.options_json);
              if (Array.isArray(parsed)) opts = parsed;
            } catch (_) {}
          }
          let correctAns = q.correct_answer || q.answer || q.correctAnswer || q.correct || localMeta.answer || localMeta.correctAnswer || (opts.length > 0 && q.correct_index !== undefined ? opts[q.correct_index] : '');
          let userAns = q.user_answer || localMeta.user_answer || '';
          const expl = q.explanation || q.comment || q.fact || localMeta.explanation || '';

          // Heal corrupted acronyms if explanation or question specifies it (e.g. Щ.И.Т.)
          if (expl.includes('Щ.И.Т.') || (typeof qText === 'string' && qText.includes('Ник Фьюри'))) {
            opts = opts.map(o => (o === 'И.Т.' || o === 'Т.') ? 'Щ.И.Т.' : o);
            if (correctAns === 'И.Т.' || correctAns === 'Т.') {
              correctAns = 'Щ.И.Т.';
            }
            if (userAns === 'И.Т.' || userAns === 'Т.') {
              userAns = 'Щ.И.Т.';
            }
          }

          const rawTitle = String(q.title || localMeta.title || '').trim();
          const titleMatch = rawTitle.match(/^(.+?)\s*\((\d+)\)$/);
          const roundNum = q.round || localMeta.round || (qIdxNum <= 25 ? 1 : qIdxNum <= 50 ? 2 : qIdxNum <= 75 ? 3 : 4);
          const catIdxGlobal = qIdxNum <= 75 ? (roundNum - 1) * 5 + Math.floor(((qIdxNum - 1) % 25) / 5) : -1;
          const fallbackTopicEntry = catIdxGlobal >= 0 ? localAllTopics[catIdxGlobal] : undefined;

          const resolvedCat =
            q.category ||
            q.categoryName ||
            localMeta.category ||
            localMeta.categoryName ||
            (titleMatch ? titleMatch[1].trim() : '') ||
            (rawTitle && rawTitle !== 'Вопрос' && !rawTitle.startsWith('Вопрос ') && rawTitle !== qText ? rawTitle : '') ||
            fallbackTopicEntry?.name ||
            '';
          const resolvedVal =
            q.value ??
            localMeta.value ??
            (titleMatch ? Number(titleMatch[2]) : undefined);
          const resolvedCatDesc =
            q.category_description ||
            localMeta.category_description ||
            fallbackTopicEntry?.description ||
            '';

          return {
            ...localMeta,
            ...q,
            id: q.id || `gq_${pack.id}_${qIdxNum}`,
            question_index: qIdxNum,
            round: roundNum,
            category: resolvedCat || undefined,
            categoryName: resolvedCat || undefined,
            category_description: resolvedCatDesc || undefined,
            value: resolvedVal,
            text: qText,
            question: qText,
            correctAnswer: correctAns,
            answer: correctAns,
            correct_answer: correctAns,
            user_answer: userAns,
            is_answered: Number(q.is_answered) === 1 || Boolean(q.isAnswered) || Number(localMeta.is_answered) === 1 || Boolean(localMeta.isAnswered) ? 1 : 0,
            is_correct: Number(q.is_correct) === 1 || Number(localMeta.is_correct) === 1 ? 1 : 0,
            is_skipped: Number(q.is_skipped) === 1 || Number(localMeta.is_skipped) === 1 ? 1 : 0,
            times_shown: Math.max(Number(q.times_shown || 0), Number(localMeta.times_shown || 0)),
            times_correct: Math.max(Number(q.times_correct || 0), Number(localMeta.times_correct || 0)),
            times_incorrect: Math.max(Number(q.times_incorrect || 0), Number(localMeta.times_incorrect || 0)),
            times_skipped: Math.max(Number(q.times_skipped || 0), Number(localMeta.times_skipped || 0)),
            options: opts,
            hint: q.hint || localMeta.hint || '',
            explanation: expl
          };
        });

        const gameType = (activeProgress?.game_type || activeProgress?.game_id || pack.game_id || '').toLowerCase();
        const isJeopardy = gameType.includes('jeopardy') || String(pack.id || '').includes('jeopardy') || String(pack.game_title || '').includes('Своя') || String(pack.title || '').includes('Своя');
        const isWhatWhereWhen = gameType === 'whatwherewhen' || pack.game_title === 'ЧтоГдеКвада' || (typeof pack.title === 'string' && (pack.title.includes('Что? Где?') || pack.title.includes('ЧтоГдеКвада')));
        const isMillionaire = gameType === 'millionaire' || pack.game_title === 'Квиллионер' || (typeof pack.title === 'string' && pack.title.includes('Квиллионер'));
        const is100to1 = gameType === '100to1' || pack.game_title === 'Сто Квадному' || (typeof pack.title === 'string' && pack.title.includes('Сто Квадному'));

        const totalQCount = questions.length || pack.question_count || (isWhatWhereWhen ? 11 : 10);
        const rawAnsweredCount = questions.filter((q: any) => q.is_answered === 1 || !!q.user_answer || (q.times_correct && q.times_correct > 0) || (q.times_incorrect && q.times_incorrect > 0) || q.is_skipped === 1 || (q.times_skipped && q.times_skipped > 0)).length;
        const rawProgressStep = activeProgress && typeof activeProgress.current_step === 'number' ? activeProgress.current_step : 0;
        const modalMpMyRound = isModalMp
          ? Math.max(1, Math.min(totalQCount, Number(pack.mp_my_round || activeProgress?.mp_my_round || (rawProgressStep + 1)) || 1))
          : 1;
        const progressCurrentStep = isModalMp
          ? (modalMpMyFinished ? totalQCount : Math.max(rawProgressStep, modalMpMyRound - 1))
          : rawProgressStep;
        const answeredCount = isWhatWhereWhen ? rawAnsweredCount : Math.max(rawAnsweredCount, progressCurrentStep);
        const gameTitle = isJeopardy ? 'Своя Икра' : getGameTitle(pack.game_id || pack.game_title || activeProgress?.game_type);

        let modalTopic = pack.topic;
        if (activeProgress?.state) {
          try {
            const st = typeof activeProgress.state === 'string' ? JSON.parse(activeProgress.state) : activeProgress.state;
            if (st?.gameTopic && typeof st.gameTopic === 'string' && st.gameTopic.trim().length > 0) {
              modalTopic = st.gameTopic.trim();
            }
          } catch (_) {}
        }
        if ((!modalTopic || modalTopic === 'Разные' || modalTopic === 'Общие знания') && isJeopardy) {
          const matchPack = (savedPacks || []).find((p: any) => p && p.id === pack.id);
          if (matchPack?.topic && matchPack.topic !== 'Разные' && matchPack.topic !== 'Общие знания') {
            modalTopic = matchPack.topic;
          }
        }
        const displayModalTopic = modalTopic || 'Общие знания';

        // Check if a finished session exists in gameHistory for this pack in Millionaire
        const hasFinishedMillionaireSession = isMillionaire && gameHistory.some((s: any) => 
          s && (s.pack_id === pack.id || s.packId === pack.id) && (s.game_id === 'millionaire' || s.gameId === 'millionaire')
        );

        // For Millionaire only: check if there was any mistake/incorrect answer in the pack
        const hasMillionaireMistake = isMillionaire && questions.some((q: any) => {
          const isWrongAnswer = (q.is_answered === 1 || !!q.user_answer) && Number(q.is_correct || 0) === 0;
          const isSkippedOrGaveUp = q.is_skipped === 1 || q.times_skipped > 0 || q.user_answer === 'Не знаю ответ' || q.user_answer === 'Пропущено';
          const hasFailedAttempts = (q.times_incorrect || 0) > 0;
          return isWrongAnswer || isSkippedOrGaveUp || hasFailedAttempts;
        });

        const firstUnansweredIndex = questions.findIndex((q: any) => {
          const isAns = q.is_answered === 1 || !!q.user_answer || (q.times_correct && q.times_correct > 0) || (q.times_incorrect && q.times_incorrect > 0);
          const isSkip = q.is_skipped === 1 || q.times_skipped > 0 || q.user_answer === 'Не знаю' || q.user_answer === 'Не знаю ответ' || q.user_answer === 'Пропущено' || q.user_answer === 'Время вышло';
          return !isAns && !isSkip;
        });

        // For WhatWhereWhen: check progress state for active currentIndex
        const wwwActiveIndex = isWhatWhereWhen && activeProgress?.state
          ? (() => {
              try {
                const st = typeof activeProgress.state === 'string' ? JSON.parse(activeProgress.state) : activeProgress.state;
                const answered = Array.isArray(st.answeredIndices) ? st.answeredIndices : [];
                if (typeof st.currentIndex === 'number' && !answered.includes(st.currentIndex)) {
                  return st.currentIndex;
                }
              } catch (_) {}
              return -1;
            })()
          : -1;

        const currentUnansweredStep = isModalMp
          ? (modalMpMyFinished ? Math.max(0, totalQCount - 1) : Math.max(0, modalMpMyRound - 1))
          : wwwActiveIndex !== -1
          ? wwwActiveIndex
          : (firstUnansweredIndex !== -1 
              ? firstUnansweredIndex 
              : (activeProgress && typeof activeProgress.current_step === 'number' ? activeProgress.current_step : 0));

        // For Millionaire: if finished (mistake, taken money via "Забрать", or no active unfinished progress), cannot resume.
        // If actively paused/unfinished with no mistakes, user can resume.
        // For other games, resume is allowed as usual.
        const canResumeGame = isModalMp
          ? modalMpStatus !== 'finished'
          : isMillionaire 
          ? (hasUnfinishedGame && !hasMillionaireMistake && !hasFinishedMillionaireSession && answeredCount < totalQCount)
          : (hasUnfinishedGame || firstUnansweredIndex !== -1);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-transparent backdrop-blur-2xl">
            <div className="w-full max-w-3xl max-h-[88vh] p-3.5 sm:p-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl flex flex-col text-foreground relative min-w-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 pb-3 sm:pb-4 border-b border-primary/20 min-w-0">
                <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div className="p-2.5 sm:p-3 rounded-2xl bg-transparent backdrop-blur-md text-primary border border-primary/20 shrink-0">
                    <HelpCircle size={22} className="sm:w-[26px] sm:h-[26px]" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                      <h3 className="text-base sm:text-xl font-black text-foreground break-words">{gameTitle}</h3>
                      {isModalMp && (
                        <BubbleElement size="sm" isBadge active className="!px-2.5 !py-0.5 !text-sm shrink-0">
                          Мультиплеер
                        </BubbleElement>
                      )}
                      {isModalMp && modalMpTimerStr && modalMpStatus === 'active' && (
                        <BubbleElement size="sm" isBadge active className="!px-2.5 !py-0.5 !text-sm shrink-0">
                          Таймер: {modalMpTimerStr}
                        </BubbleElement>
                      )}
                      {pack.id && (
                        <BubbleElement
                          size="sm"
                          isBadge
                          className="!px-2.5 !py-0.5 !text-sm font-mono font-bold text-foreground/70 max-w-full"
                          title={`id пака: ${pack.id}`}
                        >
                          <span className="whitespace-normal break-all text-left">
                            id: {pack.id}
                          </span>
                        </BubbleElement>
                      )}
                    </div>
                    <p className="text-sm text-foreground/75 font-medium break-words leading-snug">
                      {isModalMp && !modalMpMyFinished && modalMpStatus !== 'finished'
                        ? `Вы остановились на вопросе ${modalMpMyRound} из ${totalQCount} • Тема: ${displayModalTopic}`
                        : `Сыграно вопросов: ${answeredCount} из ${totalQCount} • Тема: ${displayModalTopic}`}
                      {isMillionaire && hasMillionaireMistake && (
                        <span className="ml-1.5 text-rose-400 font-bold">• Игра завершена</span>
                      )}
                    </p>
                  </div>
                </div>

                <BubbleElement
                  size="sm"
                  onClick={() => setSelectedPackForQuestions(null)}
                  icon={<X size={18} />}
                  className="p-2 shrink-0"
                />
              </div>

              {/* Scrollable Questions List */}
              <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 sm:py-5 space-y-3 sm:space-y-4 pr-0.5 sm:pr-2 min-w-0">
                {questions.length > 0 ? (
                  questions.map((q: any, idx: number) => {
                    const qText = q.question || q.text || q.prompt || `Вопрос №${idx + 1}`;
                    const options = Array.isArray(q.options) ? q.options : [];
                    const correctAns = q.correct_answer || q.answer || q.correctAnswer || (options.length > 0 && q.correct_index !== undefined ? options[q.correct_index] : null);
                    const explanation = q.explanation || q.comment || q.fact;
                    const userAnswer = q.user_answer;
                    const rawSkipped = Number(q.times_skipped || 0);
                    const isSkipped =
                      rawSkipped > 0 ||
                      userAnswer === 'Не знаю' ||
                      userAnswer === 'Не знаю ответ' ||
                      userAnswer === 'Пропущено' ||
                      userAnswer === 'Вопрос пропущен' ||
                      userAnswer === 'Время вышло' ||
                      userAnswer === 'Время на ответ (15 сек) истекло' ||
                      userAnswer === 'Никто не ответил' ||
                      Number(q.is_skipped) === 1;

                    const rawCorrect = Number(q.times_correct || 0);
                    const rawIncorrect = Number(q.times_incorrect || 0);
                    const rawShown = Number(q.times_shown || 0);

                    // A question is answered if explicitly marked as answered or has answer recorded, or passed in single-step games
                    const isAnswered =
                      (Number(q.is_answered) === 1 ||
                        Boolean(q.isAnswered) ||
                        (!!userAnswer && !isSkipped) ||
                        rawCorrect > 0 ||
                        rawIncorrect > 0 ||
                        (!isWhatWhereWhen && !is100to1 && !isJeopardy && activeProgress && idx < progressCurrentStep && (rawShown > 0 || q.is_answered))) &&
                      !isSkipped;
                    const isCorrectAnswer = Number(q.is_correct) === 1 || rawCorrect > 0;

                    const timesCorrect = isAnswered && isCorrectAnswer ? Math.max(1, rawCorrect) : rawCorrect;
                    const timesSkipped = isSkipped ? Math.max(1, rawSkipped) : rawSkipped;
                    const timesIncorrect = isAnswered && !isCorrectAnswer && !isSkipped ? Math.max(1, rawIncorrect) : rawIncorrect;
                    const timesShown =
                      isAnswered ||
                      isSkipped ||
                      timesCorrect > 0 ||
                      timesIncorrect > 0 ||
                      timesSkipped > 0 ||
                      (!isWhatWhereWhen && !is100to1 && !isJeopardy && activeProgress && idx < progressCurrentStep)
                        ? Math.max(1, rawShown, timesCorrect + timesIncorrect + timesSkipped > 0 ? 1 : 0)
                        : rawShown;
                    
                    // If question is answered or skipped, reveal the correct answer and explanation. Keep hidden only if not played.
                    const canRevealAnswer = (isAnswered || isSkipped) && (timesShown >= 1 || Number(q.is_answered) === 1 || Boolean(q.isAnswered) || Number(q.is_skipped) === 1 || timesCorrect > 0 || timesIncorrect > 0);
                    
                    // Question is considered the active unanswered question that was shown and can be resumed
                    const isCurrentUnansweredQuestion = isModalMp
                      ? (!isJeopardy && canResumeGame && idx === currentUnansweredStep)
                      : (canResumeGame && idx === currentUnansweredStep && !isAnswered && !isSkipped);
                    const isQuestionPlayed = isAnswered || isSkipped || timesShown > 0 || isCurrentUnansweredQuestion || (!isWhatWhereWhen && !is100to1 && !isJeopardy && activeProgress && idx < progressCurrentStep) || (is100to1 && Number(q.is_answered) === 1);

                    return (
                      <div 
                        key={`q-idx-${idx}-${q.id || idx}`} 
                        className={`p-3.5 sm:p-5 rounded-2xl border bg-transparent backdrop-blur-xl space-y-2.5 shadow-lg w-full min-w-0 overflow-hidden ${
                          isCurrentUnansweredQuestion 
                            ? 'border-primary/60 shadow-[0_0_20px_rgba(153,208,55,0.2)]' 
                            : 'border-primary/20'
                        }`}
                      >
                        {/* Top row: Question number + Round/Points badges + Status/Continue button */}
                        <div className="flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                            <span className={`w-7 h-7 rounded-full font-black text-sm flex items-center justify-center shrink-0 shadow-sm border bg-transparent backdrop-blur-md ${
                              isCurrentUnansweredQuestion 
                                ? 'text-primary border-primary shadow-[0_0_10px_rgba(153,208,55,0.5)]' 
                                : 'text-primary border-primary/35'
                            }`}>
                              {idx + 1}
                            </span>

                            {isJeopardy && q.round && (
                              <BubbleElement size="sm" isBadge className="!px-2.5 !py-0.5 text-sm text-foreground/75 shrink-0">
                                {q.round === 4 ? 'Суперфинал' : `Тур ${q.round}`}
                              </BubbleElement>
                            )}

                            {q.value !== undefined && q.value !== null && (
                              <BubbleElement size="sm" isBadge className="!px-2.5 !py-0.5 text-sm font-black text-amber-300 border-amber-500/30 shrink-0">
                                {q.value} очков
                              </BubbleElement>
                            )}
                          </div>

                          {/* Question Status Badge / Action */}
                          {isCurrentUnansweredQuestion ? (
                            <LeafButton
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setSelectedPackForQuestions(null);
                                if (isModalMp && modalMpRoomId) {
                                  handleResumeProgress(activeProgress || pack, pack, idx);
                                  return;
                                }
                                const gameType = activeProgress?.game_type || activeProgress?.game_id || pack.game_id || 'blitz';
                                const gamePath = 
                                  gameType === 'blitz' ? '/game/blitz' :
                                  gameType === 'millionaire' ? '/game/millionaire' :
                                  gameType === 'whatwherewhen' ? '/game/whatwherewhen' :
                                  gameType === '100to1' ? '/game/100to1' :
                                  gameType === 'jeopardy' ? '/game/jeopardy' :
                                  gameType === 'melody' ? '/game/melody' : `/game/${gameType}`;

                                if (displayModalTopic) {
                                  addRecentTopic(displayModalTopic);
                                }

                                const modalActiveState = typeof activeProgress?.state === 'string' 
                                  ? JSON.parse(activeProgress.state || '{}') 
                                  : (activeProgress?.state || {});

                                navigate(gamePath, {
                                  state: {
                                    packId: pack.id,
                                    resume: true,
                                    currentIndex: currentUnansweredStep,
                                    score: typeof activeProgress?.score === 'number' ? activeProgress.score : (modalActiveState?.expertScore ?? modalActiveState?.score ?? 0),
                                    viewerScore: typeof modalActiveState?.viewerScore === 'number' ? modalActiveState.viewerScore : 0,
                                    topic: displayModalTopic,
                                    difficulty: pack.difficulty || activeProgress?.difficulty,
                                    questions: questions
                                  }
                                });
                              }}
                              icon={<Play size={15} className="fill-current" />}
                              className="text-sm font-bold py-1.5 px-3 shrink-0 shadow-md max-w-full"
                            >
                              {isModalMp
                                ? modalMpMyFinished
                                  ? 'В комнату ожидания'
                                  : `Продолжить с вопроса ${idx + 1}`
                                : 'Продолжить'}
                            </LeafButton>
                          ) : isSkipped ? (
                            <BubbleElement size="sm" isBadge className="border-amber-500/35 text-amber-300 text-sm shrink-0">
                              Пропущен
                            </BubbleElement>
                          ) : isAnswered ? (
                            <BubbleElement size="sm" isBadge className={`text-sm shrink-0 ${
                              isCorrectAnswer 
                                ? 'border-emerald-500/35 text-emerald-300' 
                                : 'border-rose-500/35 text-rose-300'
                            }`}>
                              {isCorrectAnswer ? 'Отвечен верно' : 'Неверный ответ'}
                            </BubbleElement>
                          ) : timesShown > 0 ? (
                            <BubbleElement size="sm" isBadge className="border-amber-500/35 text-amber-300 text-sm shrink-0">
                              В процессе
                            </BubbleElement>
                          ) : (
                            <BubbleElement size="sm" isBadge className="border-primary/20 text-foreground/60 text-sm shrink-0">
                              В ожидании
                            </BubbleElement>
                          )}
                        </div>

                        {/* Separate Full-Width Rows for Question Topic and Category */}
                        {(() => {
                          const qCategory = q.category || q.categoryName || '';
                          const qGameTopic = q.game_topic || displayModalTopic || q.topic || 'Общие знания';
                          if (isJeopardy) {
                            return (
                              <div className="flex flex-col gap-1.5 w-full min-w-0">
                                <BubbleElement size="sm" isBadge className="w-full justify-start rounded-2xl !px-3 !py-1.5 text-sm font-bold text-primary">
                                  <span className="whitespace-normal break-words text-left leading-snug block w-full">
                                    Тема: {qGameTopic}
                                  </span>
                                </BubbleElement>
                                {qCategory && (
                                  <BubbleElement size="sm" isBadge active className="w-full justify-start rounded-2xl !px-3 !py-1.5 text-sm font-bold">
                                    <span className="whitespace-normal break-words text-left leading-snug block w-full">
                                      Категория: {qCategory}
                                    </span>
                                  </BubbleElement>
                                )}
                                {q.category_description && (
                                  <span className="text-sm text-foreground/60 italic break-words w-full px-1">
                                    {q.category_description}
                                  </span>
                                )}
                              </div>
                            );
                          }
                          const rawTopic = q.topic || displayModalTopic || '';
                          const hasDistinctCategory = Boolean(
                            qCategory &&
                            rawTopic &&
                            qCategory.trim().toLowerCase() !== rawTopic.trim().toLowerCase()
                          );
                          const primaryTopic = rawTopic || qCategory;
                          if (!primaryTopic && !qCategory) return null;
                          return (
                            <div className="flex flex-col gap-1.5 w-full min-w-0">
                              {primaryTopic && (
                                <BubbleElement size="sm" isBadge className="w-full justify-start rounded-2xl !px-3 !py-1.5 text-sm font-bold text-primary">
                                  <span className="whitespace-normal break-words text-left leading-snug block w-full">
                                    Тема: {primaryTopic}
                                  </span>
                                </BubbleElement>
                              )}
                              {hasDistinctCategory && (
                                <BubbleElement size="sm" isBadge active className="w-full justify-start rounded-2xl !px-3 !py-1.5 text-sm font-bold">
                                  <span className="whitespace-normal break-words text-left leading-snug block w-full">
                                    Категория: {qCategory}
                                  </span>
                                </BubbleElement>
                              )}
                            </div>
                          );
                        })()}

                        {/* Question Text */}
                        <div className="w-full min-w-0">
                          {isQuestionPlayed ? (
                            <p className="text-sm sm:text-base font-bold text-foreground leading-snug break-words">
                              {qText}
                            </p>
                          ) : (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-transparent backdrop-blur-md border border-primary/15 text-foreground/60 w-full min-w-0">
                              <EyeOff size={16} className="text-primary/70 shrink-0" />
                              <span className="text-sm font-medium italic break-words min-w-0">
                                Текст вопроса скрыт до показа в игре
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Question Statistics Counters */}
                        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-sm font-semibold w-full min-w-0">
                          <span className="px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-md border border-primary/20 text-foreground/85">
                            Показан: <span className="font-bold text-primary">{timesShown}</span> раз
                          </span>
                          <span className="px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-md border border-emerald-500/30 text-emerald-300">
                            Верно: <span className="font-bold">{timesCorrect}</span>
                          </span>
                          <span className="px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-md border border-rose-500/30 text-rose-300">
                            Ошибок: <span className="font-bold">{timesIncorrect}</span>
                          </span>
                          {timesSkipped > 0 && (
                            <span className="px-2.5 py-1 rounded-xl bg-transparent backdrop-blur-md border border-amber-500/30 text-amber-300">
                              Пропущено: <span className="font-bold">{timesSkipped}</span>
                            </span>
                          )}
                        </div>

                        {/* Options if available and question has been played */}
                        {isQuestionPlayed && options.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 w-full min-w-0">
                            {options.map((opt: string, optIdx: number) => {
                              const normOpt = opt.trim().toLowerCase().replace(/[\s\.,\/#!$%\^&\*;:{}=\-_`~()«»""'']/g, '');
                              const normCorrect = correctAns ? String(correctAns).trim().toLowerCase().replace(/[\s\.,\/#!$%\^&\*;:{}=\-_`~()«»""'']/g, '') : '';
                              const normUser = userAnswer ? String(userAnswer).trim().toLowerCase().replace(/[\s\.,\/#!$%\^&\*;:{}=\-_`~()«»""'']/g, '') : '';

                              const isOptionCorrect = canRevealAnswer && (
                                opt === correctAns || 
                                optIdx === q.correct_index || 
                                (!!normOpt && !!normCorrect && normOpt === normCorrect)
                              );
                              const isUserSelected = !!userAnswer && (
                                opt.trim().toLowerCase() === userAnswer.trim().toLowerCase() ||
                                (!!normOpt && !!normUser && normOpt === normUser) ||
                                (q.is_correct && isOptionCorrect)
                              );
                              return (
                                <div 
                                  key={`q-opt-${idx}-${optIdx}-${opt}`} 
                                  className={`px-3 py-2 rounded-xl text-sm font-semibold border bg-transparent backdrop-blur-md break-words w-full min-w-0 ${
                                    isOptionCorrect 
                                      ? 'border-emerald-500/50 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]' 
                                      : isUserSelected && !q.is_correct
                                      ? 'border-rose-500/45 text-rose-300'
                                      : 'border-primary/15 text-foreground/75'
                                  }`}
                                >
                                  {opt} {isOptionCorrect && '✓'}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* User answer if recorded */}
                        {isQuestionPlayed && userAnswer && (
                          <div className="text-sm font-medium text-foreground/85 break-words w-full min-w-0">
                            Ваш ответ: <span className={`font-bold ${isSkipped ? 'text-amber-300' : q.is_correct ? 'text-emerald-300' : 'text-rose-300'}`}>"{userAnswer}"</span>
                          </div>
                        )}

                        {/* Revealed correct answer and explanation OR subtle hidden placeholder */}
                        {canRevealAnswer ? (
                          <div className="space-y-2 w-full min-w-0">
                            {correctAns && options.length === 0 && (
                              <div className="pt-0.5 w-full min-w-0">
                                <span className="text-sm font-bold text-emerald-300 bg-transparent backdrop-blur-md border border-emerald-500/35 px-3 py-1.5 rounded-xl inline-block max-w-full break-words">
                                  Правильный ответ: {correctAns}
                                </span>
                              </div>
                            )}
                            {explanation && (
                              <div className="text-sm text-foreground/75 font-medium break-words leading-snug w-full min-w-0">
                                Пояснение: {explanation}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="pt-0.5 w-full min-w-0">
                            {isCurrentUnansweredQuestion ? (
                              <span className="text-sm font-semibold text-primary bg-transparent backdrop-blur-md border border-primary/30 px-3 py-1.5 rounded-xl block w-full break-words leading-snug">
                                Вопрос открыт в незавершенной партии — нажмите «Продолжить», чтобы ответить
                              </span>
                            ) : isMillionaire && !canResumeGame && !isAnswered ? (
                              <span className="text-sm font-semibold text-rose-400/90 bg-transparent backdrop-blur-md border border-rose-500/25 px-3 py-1.5 rounded-xl block w-full break-words leading-snug">
                                {hasMillionaireMistake 
                                  ? 'Игра завершена (допущена ошибка) — вопрос не был разыгран'
                                  : 'Игра завершена (выигрыш зафиксирован) — вопрос не был разыгран'}
                              </span>
                            ) : isSkipped ? (
                              <span className="text-sm font-semibold text-amber-300/90 bg-transparent backdrop-blur-md border border-amber-500/25 px-3 py-1.5 rounded-xl block w-full break-words leading-snug">
                                Вопрос был пропущен — правильный ответ скрыт
                              </span>
                            ) : timesShown > 0 ? (
                              <span className="text-sm font-semibold text-foreground/65 bg-transparent backdrop-blur-md border border-primary/15 px-3 py-1.5 rounded-xl block w-full break-words leading-snug">
                                Вопрос в процессе игры — ответ скрыт
                              </span>
                            ) : (
                              <span className="text-sm font-semibold text-foreground/50 bg-transparent backdrop-blur-md border border-primary/10 px-3 py-1.5 rounded-xl block w-full break-words leading-snug">
                                Вопрос еще не сыгран — вопрос и ответ скрыты
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="py-12 text-center text-foreground/60 space-y-2">
                    <p className="text-base font-bold text-foreground">Вопросы не найдены</p>
                    <p className="text-sm text-foreground/50">
                      Вопросы отображаются по мере прохождения игровых раундов.
                    </p>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="pt-3 sm:pt-4 border-t border-primary/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3 w-full min-w-0">
                {hasUnfinishedGame ? (
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setSelectedPackForQuestions(null);
                      if (isModalMp && modalMpRoomId) {
                        handleResumeProgress(activeProgress || pack, pack, currentUnansweredStep);
                        return;
                      }
                      const gameType = activeProgress?.game_type || activeProgress?.game_id || pack.game_id || 'blitz';
                      const gamePath = 
                        gameType === 'blitz' ? '/game/blitz' :
                        gameType === 'millionaire' ? '/game/millionaire' :
                        gameType === 'whatwherewhen' ? '/game/whatwherewhen' :
                        gameType === '100to1' ? '/game/100to1' :
                        gameType === 'jeopardy' ? '/game/jeopardy' :
                        gameType === 'melody' ? '/game/melody' : `/game/${gameType}`;

                      if (displayModalTopic) {
                        addRecentTopic(displayModalTopic);
                      }

                      const modalActiveState = typeof activeProgress?.state === 'string' 
                        ? JSON.parse(activeProgress.state || '{}') 
                        : (activeProgress?.state || {});

                      navigate(gamePath, {
                        state: {
                          packId: pack.id,
                          resume: true,
                          currentIndex: currentUnansweredStep,
                          score: typeof activeProgress?.score === 'number' ? activeProgress.score : (modalActiveState?.expertScore ?? modalActiveState?.score ?? 0),
                          viewerScore: typeof modalActiveState?.viewerScore === 'number' ? modalActiveState.viewerScore : 0,
                          topic: displayModalTopic,
                          difficulty: pack.difficulty || activeProgress?.difficulty,
                          questions: questions
                        }
                      });
                    }}
                    icon={<Play size={18} className="fill-current" />}
                    className="font-bold text-sm w-full sm:w-auto justify-center"
                  >
                    {isModalMp
                      ? modalMpMyFinished
                        ? `Комната ожидания мультиплеера${modalMpTimerStr ? ` (${modalMpTimerStr})` : ''}`
                        : `Продолжить мультиплеер (вопрос ${currentUnansweredStep + 1})`
                      : `Продолжить игру (вопрос ${currentUnansweredStep + 1})`}
                  </LeafButton>
                ) : (
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setSelectedPackForQuestions(null);
                      handlePlayPack(pack);
                    }}
                    icon={<RotateCcw size={18} />}
                    className="font-bold text-sm w-full sm:w-auto justify-center"
                  >
                    Сыграть заново
                  </LeafButton>
                )}

                <BubbleElement
                  size="md"
                  onClick={() => setSelectedPackForQuestions(null)}
                  className="text-sm font-semibold cursor-pointer w-full sm:w-auto justify-center py-2.5"
                >
                  Закрыть
                </BubbleElement>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mobile Filters & Sorting Modal for /profile/history */}
      {isHistoryFiltersModalOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex items-center justify-center p-3 bg-transparent backdrop-blur-2xl">
          <div className="w-full max-w-lg max-h-[88vh] p-4 rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl shadow-2xl flex flex-col text-foreground relative min-w-0 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-primary/20">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2.5 rounded-2xl bg-transparent border border-primary/25 text-primary shrink-0">
                  <Filter size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-foreground truncate">Фильтры и сортировка</h3>
                  <p className="text-sm text-foreground/70 truncate">Настройка отображения истории</p>
                </div>
              </div>
              <BubbleElement
                size="sm"
                onClick={() => setIsHistoryFiltersModalOpen(false)}
                icon={<X size={18} />}
                className="p-2 shrink-0"
              />
            </div>

            {/* Scrollable Filters Body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-3.5 space-y-4 pr-1 min-w-0">
              {/* Sorting */}
              <div className="space-y-2 p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-primary flex items-center gap-1.5">
                    <ArrowUpDown size={15} />
                    Сортировка
                  </span>
                  <BubbleElement
                    type="button"
                    size="sm"
                    onClick={() => setHistorySortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                    icon={<ArrowUpDown size={14} />}
                    className="text-sm"
                  >
                    {historySortBy === 'date'
                      ? (historySortOrder === 'desc' ? 'Сначала новые' : 'Сначала старые')
                      : (historySortOrder === 'asc' ? 'От А до Я' : 'От Я до А')}
                  </BubbleElement>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { id: 'date', label: 'По дате', icon: <Calendar size={14} /> },
                    { id: 'title', label: 'По названию', icon: <Type size={14} /> },
                    { id: 'topic', label: 'По теме', icon: <Sparkles size={14} /> },
                    { id: 'gameType', label: 'По типу игры', icon: <Gamepad2 size={14} /> }
                  ].map((sortOpt) => {
                    const isActive = historySortBy === sortOpt.id;
                    return (
                      <BubbleElement
                        key={`mob-sort-${sortOpt.id}`}
                        type="button"
                        size="sm"
                        active={isActive}
                        icon={sortOpt.icon}
                        onClick={() => handleSelectSort(sortOpt.id as any)}
                        className="w-full justify-center text-sm"
                      >
                        <span className="truncate">{sortOpt.label}</span>
                        {isActive && (
                          <span className="ml-0.5 text-sm font-black">
                            {historySortOrder === 'desc' ? '↓' : '↑'}
                          </span>
                        )}
                      </BubbleElement>
                    );
                  })}
                </div>
              </div>

              {/* Play Mode Filter */}
              <div className="space-y-2 p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <span className="text-sm font-bold text-primary block">Режим игры</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'Все' },
                    { id: 'single', label: 'Одиночная' },
                    { id: 'multi', label: 'Мультиплеер' }
                  ].map((mOpt) => (
                    <BubbleElement
                      key={`mob-mode-${mOpt.id}`}
                      size="sm"
                      active={historyModeFilter === mOpt.id}
                      onClick={() => {
                        setHistoryModeFilter(mOpt.id as 'all' | 'single' | 'multi');
                        setSessionsPage(1);
                      }}
                    >
                      {mOpt.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>

              {/* Game Type Filter */}
              <div className="space-y-2 p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <span className="text-sm font-bold text-primary block">Игра</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'Все' },
                    { id: 'blitz', label: 'КвИИз' },
                    { id: 'millionaire', label: 'Квиллионер' },
                    { id: '100to1', label: 'Сто Квадному' },
                    { id: 'whatwherewhen', label: 'ЧтоГдеКвада' },
                    { id: 'melody', label: 'Укавкай мелодию' },
                    { id: 'jeopardy', label: 'Своя Икра' }
                  ].map((filter) => (
                    <BubbleElement
                      key={`mob-game-${filter.id}`}
                      size="sm"
                      active={historyGameFilter === filter.id}
                      onClick={() => {
                        setHistoryGameFilter(filter.id);
                        setSessionsPage(1);
                      }}
                    >
                      {filter.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>

              {/* Difficulty Filter */}
              {historyGameFilter !== 'jeopardy' && (
                <div className="space-y-2 p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                  <span className="text-sm font-bold text-primary block">Сложность</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'Все' },
                      { id: 'dummy', label: 'ИИкра' },
                      { id: 'people', label: 'Головастик' },
                      { id: 'genius', label: 'Квант' },
                      { id: 'god', label: 'Ляга' }
                    ].map((diff) => (
                      <BubbleElement
                        key={`mob-diff-${diff.id}`}
                        size="sm"
                        active={historyDifficultyFilter === diff.id}
                        onClick={() => setHistoryDifficultyFilter(diff.id)}
                      >
                        {diff.label}
                      </BubbleElement>
                    ))}
                  </div>
                </div>
              )}

              {/* Result Filter */}
              <div className="space-y-2 p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <span className="text-sm font-bold text-primary block">Результат</span>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'all', label: 'Все партии' },
                    { id: 'win', label: 'Победы' },
                    { id: 'loss', label: 'Поражения' }
                  ].map((rFilter) => (
                    <BubbleElement
                      key={`mob-res-${rFilter.id}`}
                      size="sm"
                      active={historyResultFilter === rFilter.id}
                      onClick={() => {
                        setHistoryResultFilter(rFilter.id as any);
                        setSessionsPage(1);
                      }}
                    >
                      {rFilter.label}
                    </BubbleElement>
                  ))}
                </div>
              </div>

              {/* Topic Filter */}
              <div className="space-y-2.5 p-3 rounded-2xl border border-primary/20 bg-transparent backdrop-blur-xl">
                <span className="text-sm font-bold text-primary block">Фильтр по теме</span>
                <BubbleElement
                  type="button"
                  size="sm"
                  onClick={() => setIsHistoryTopicModalOpen(true)}
                  icon={<Sparkles size={14} />}
                  className="w-full justify-center py-2"
                >
                  Каталог тем ({historyTotalTopicsCount || historyDbTopics.length})
                </BubbleElement>
                <div className="relative flex items-center w-full">
                  <input
                    type="text"
                    placeholder="Введите тему..."
                    value={historyTopicFilter}
                    onChange={e => setHistoryTopicFilter(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-2xl bg-transparent border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary placeholder:text-foreground/40 backdrop-blur-md"
                  />
                  {historyTopicFilter && (
                    <button
                      onClick={() => setHistoryTopicFilter('')}
                      className="absolute right-2.5 p-1 rounded-lg text-sm text-foreground/60 hover:text-primary transition-colors"
                      title="Очистить фильтр темы"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-primary/20 flex items-center justify-between gap-2">
              <BubbleElement
                size="md"
                onClick={() => {
                  setHistoryModeFilter('all');
                  setHistoryDifficultyFilter('all');
                  setHistoryGameFilter('all');
                  setHistoryResultFilter('all');
                  setHistoryTopicFilter('');
                  setHistorySortBy('date');
                  setHistorySortOrder('desc');
                  setSessionsPage(1);
                }}
                icon={<RotateCcw size={15} />}
                className="text-sm font-bold py-2.5 px-4"
              >
                Сбросить
              </BubbleElement>

              <LeafButton
                variant="primary"
                size="md"
                onClick={() => setIsHistoryFiltersModalOpen(false)}
                className="font-bold text-sm px-6"
              >
                Применить
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Topic Catalog Modal for Filtering History */}
      {isHistoryTopicModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-transparent backdrop-blur-2xl">
          <div className="w-full max-w-4xl max-h-[85vh] p-4 sm:p-8 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl flex flex-col text-foreground relative min-w-0 overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-primary/20">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-primary/15 text-primary border border-primary/20">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground">Каталог тем викторины</h3>
                  <p className="text-sm text-foreground/70">
                    Всего доступно {historyTotalTopicsCount || historyDbTopics.length} тем. Выберите тему для фильтрации сохраненных игр и сессий.
                  </p>
                </div>
              </div>

              <BubbleElement
                size="sm"
                onClick={() => setIsHistoryTopicModalOpen(false)}
                icon={<X size={18} />}
                className="p-2"
              />
            </div>

            <div className="flex-1 overflow-y-auto py-5 space-y-4 pr-1">
              <TopicCloud
                topics={historyDbTopics}
                selectedTopics={historyTopicFilter ? [historyTopicFilter] : []}
                onToggle={(topic) => {
                  setHistoryTopicFilter(prev => prev === topic ? '' : topic);
                  setIsHistoryTopicModalOpen(false);
                }}
                onReset={() => setHistoryTopicFilter('')}
              />
            </div>

            <div className="pt-4 border-t border-primary/20 flex items-center justify-between">
              {historyTopicFilter ? (
                <BubbleElement
                  size="sm"
                  onClick={() => {
                    setHistoryTopicFilter('');
                    setIsHistoryTopicModalOpen(false);
                  }}
                  className="border-destructive/30 text-destructive hover:bg-destructive/20 text-sm py-2 px-4"
                >
                  Сбросить фильтр
                </BubbleElement>
              ) : <div />}

              <LeafButton
                variant="primary"
                size="md"
                onClick={() => setIsHistoryTopicModalOpen(false)}
              >
                Готово
              </LeafButton>
            </div>
          </div>
        </div>
      )}

      {/* Centered Scrollable Notification Details Modal */}
      <NotificationModal
        notification={selectedNotificationForModal}
        onClose={() => setSelectedNotificationForModal(null)}
        onDelete={handleDeleteNotification}
      />

      {/* Notifications Center Modal (opened via bell) */}
      {profile?.uid && (
        <NotificationsCenterModal
          isOpen={showNotificationsCenter}
          onClose={() => setShowNotificationsCenter(false)}
          userId={profile.uid}
          onUnreadCountChange={(c) => setUnreadNotificationsCount(c)}
        />
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent backdrop-blur-xl">
          <div className="w-full max-w-md p-6 rounded-[2rem] border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl space-y-5 text-foreground relative">
            <BubbleElement
              size="sm"
              onClick={() => {
                setShowPasswordModal(false);
                setPasswordMsg(null);
              }}
              icon={<X size={18} />}
              className="absolute top-5 right-5 p-2"
            />

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-primary/15 text-primary">
                <Lock size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Смена пароля</h3>
                <p className="text-sm text-foreground/70">Задайте новый пароль для входа в аккаунт</p>
              </div>
            </div>

            {passwordMsg && (
              <div className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
                passwordMsg.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}>
                {passwordMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{passwordMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">
                  Текущий пароль (если установлен)
                </label>
                <input
                  type="password"
                  placeholder="Введите текущий пароль"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="w-full p-3 rounded-xl bg-transparent border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">
                  Новый пароль (минимум 6 символов) <span className="text-destructive">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Новый надежный пароль"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full p-3 rounded-xl bg-transparent border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">
                  Повтор нового пароля для проверки <span className="text-destructive">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Повторите новый пароль"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 rounded-xl bg-transparent border border-primary/20 text-sm text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <BubbleElement
                  type="button"
                  size="sm"
                  onClick={() => setShowPasswordModal(false)}
                  className="text-sm py-2 px-4 text-foreground/70"
                >
                  Отмена
                </BubbleElement>
                <LeafButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={passwordLoading || !newPassword || !confirmPassword}
                  icon={passwordLoading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                >
                  Сохранить пароль
                </LeafButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top-up Payment Modal in Liquid Glass Apple style */}
      <AnimatePresence>
        {showPayment && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center bg-transparent backdrop-blur-xl p-4">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-md space-y-6 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-6 sm:p-8 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black text-primary flex items-center gap-2">
                  <BubbleCurrencyIcon className="w-6 h-6 inline" />
                  Пополнение баланса
                </h3>
                <button
                  onClick={() => setShowPayment(false)}
                  className="rounded-full p-2 hover:bg-primary/10 text-foreground/70 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {paymentStep === 'calculator' && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-primary/20 bg-transparent backdrop-blur-md p-4 text-center space-y-1">
                    <p className="text-sm font-medium text-foreground/70">Курс пополнения: 1 ИИкра = 0.99 рубля</p>
                    <p className="text-2xl font-black text-primary flex items-center justify-center gap-2">
                      {topUpAmount || 0} руб. = {formatIikr(topUpAmount || 0)} <BubbleCurrencyIcon className="w-5 h-5 inline" />
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground/80 block">
                      Сумма пополнения (в рублях или ИИкрах)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={topUpAmount || ''}
                      onChange={(e) => setTopUpAmount(Math.max(0, Number(e.target.value)))}
                      placeholder="Например, 300"
                      className="w-full rounded-2xl border border-primary/20 bg-transparent px-4 py-3 text-lg font-bold text-foreground focus:outline-none focus:border-primary backdrop-blur-md"
                    />
                  </div>

                  <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-primary/15 bg-transparent backdrop-blur-md">
                    <CreditCard className="text-primary shrink-0" size={22} />
                    <div>
                      <p className="text-sm font-bold text-foreground">Банковская карта РФ / СБП</p>
                      <p className="text-sm text-foreground/60">Быстрое безопасное зачисление без комиссии</p>
                    </div>
                  </div>

                  <div className="pt-2">
                    <LeafButton
                      variant="primary"
                      size="md"
                      disabled={!topUpAmount || topUpAmount <= 0}
                      onClick={handleTopUpPayment}
                      className="w-full justify-center"
                      icon={<Zap size={18} />}
                    >
                      Оплатить {topUpAmount || 0} руб.
                    </LeafButton>
                  </div>
                </div>
              )}

              {paymentStep === 'processing' && (
                <div className="py-10 text-center space-y-4">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center">
                    <Loader2 size={40} className="animate-spin text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-lg font-black text-primary">Обработка платежа...</h4>
                    <p className="text-sm text-foreground/70">Связываемся с платежным сервисом</p>
                  </div>
                </div>
              )}

              {paymentStep === 'success' && (
                <div className="py-8 text-center space-y-5">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-transparent text-emerald-400">
                    <CheckCircle2 size={40} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xl font-black text-emerald-400">Баланс пополнен!</h4>
                    <p className="text-sm text-foreground/70">ИИкра успешно зачислена на ваш аккаунт</p>
                  </div>
                  <LeafButton
                    variant="primary"
                    size="md"
                    onClick={() => {
                      setShowPayment(false);
                      setPaymentStep('calculator');
                    }}
                    className="w-full justify-center"
                  >
                    Вернуться в магазин
                  </LeafButton>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <NotificationSettingsModal
        isOpen={showProfileNotifSettings}
        onClose={() => setShowProfileNotifSettings(false)}
        userId={profile.uid}
      />

      <IOSInstallGuideModal
        isOpen={pwaInstall.showInstallGuide}
        onClose={() => pwaInstall.setShowInstallGuide(false)}
        isIOS={pwaInstall.isIOS}
        isAndroid={pwaInstall.isAndroid}
      />
    </div>
  );
}
