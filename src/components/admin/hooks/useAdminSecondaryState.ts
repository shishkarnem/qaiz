import { useState, useMemo } from 'react';
import { DIRECT_MEDIA_URLS } from '../../../shared/mediaUrls';

interface UseAdminSecondaryStateProps {
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  showNotification: (text: string, type?: 'success' | 'error') => void;
  setStatusMsg: (msg: { type: 'success' | 'error'; text: string } | null) => void;
}

export function useAdminSecondaryState({
  adminFetch,
  showNotification,
  setStatusMsg
}: UseAdminSecondaryStateProps) {
  const [triggers, setTriggers] = useState<any[]>([]);
  const [showAddTriggerModal, setShowAddTriggerModal] = useState(false);
  const [newTriggerSql, setNewTriggerSql] = useState('');

  const [cronInfo, setCronInfo] = useState<{ jobs: any[]; logs: any[] }>({ jobs: [], logs: [] });
  const [showAddCronModal, setShowAddCronModal] = useState(false);
  const [newCronName, setNewCronName] = useState('');
  const [newCronSchedule, setNewCronSchedule] = useState('0 0 * * *');
  const [newCronType, setNewCronType] = useState<'sql' | 'function' | 'google_sheet'>('sql');
  const [newCronPayload, setNewCronPayload] = useState('SELECT NOW();');

  const [postsList, setPostsList] = useState<any[]>([]);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [postForm, setPostForm] = useState<any>({
    title: '',
    slug: '',
    game_id: 'blitz',
    excerpt: '',
    content: '',
    image_url: DIRECT_MEDIA_URLS.GAME_BLITZ,
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    cover_prompt: '',
    author_name: 'Редакция КвИИз',
    platforms: 'app',
    scheduled_at: ''
  });

  const [logsList, setLogsList] = useState<any[]>([]);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState('all');
  const [selectedGameFilter, setSelectedGameFilter] = useState('all');
  const [isTestingProTalk, setIsTestingProTalk] = useState(false);
  const [testPromptInput, setTestPromptInput] = useState('');
  const [testPromptResult, setTestPromptResult] = useState<any>(null);

  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [promptsList, setPromptsList] = useState<
    Array<{ game_id: string; content: string; description?: string; updated_at?: string }>
  >([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [promptsSearchQuery, setPromptsSearchQuery] = useState('');
  const [promptsSavingKey, setPromptsSavingKey] = useState<string | null>(null);
  const [promptsDirty, setPromptsDirty] = useState<Record<string, boolean>>({});
  const [selectedPromptForTest, setSelectedPromptForTest] = useState<string | null>(null);
  const [promptTestVariables, setPromptTestVariables] = useState<Record<string, string>>({
    topic: 'История Древней Греции',
    topic_desc: 'Мифы, философы, войны и культура Эллады',
    note: 'Учти пожелания игрока к вопросам: сделай акцент на мифах и философах.',
    count: '3',
    diffDesc: 'Квант (3/4): высокий уровень',
    diffInstructions: 'Составляй вопросы на нестандартные факты и логику',
    level: '5',
    difficulty: 'genius',
    type: 'blitz'
  });
  const [promptTestResult, setPromptTestResult] = useState<string | null>(null);
  const [isTestingPrompt, setIsTestingPrompt] = useState(false);

  const fetchTriggers = async () => {
    try {
      const res = await adminFetch('/api/admin/system/triggers');
      if (!res.ok) return;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const data = await res.json();
      if (data && Array.isArray(data.triggers)) setTriggers(data.triggers);
    } catch (err) {
      console.error('Error fetching triggers:', err);
    }
  };

  const handleCreateTrigger = async () => {
    if (!newTriggerSql.trim()) return;
    try {
      const res = await adminFetch('/api/admin/system/triggers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: newTriggerSql.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: 'Триггер создан' });
        setShowAddTriggerModal(false);
        setNewTriggerSql('');
        fetchTriggers();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка создания триггера' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteTrigger = async (name: string) => {
    try {
      const res = await adminFetch(`/api/admin/system/triggers/${name}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Триггер ${name} удален` });
        fetchTriggers();
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка удаления' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const fetchCron = async (silent = false) => {
    try {
      const res = await adminFetch('/api/admin/system/cron');
      if (!res.ok) return;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const data = await res.json();
      if (data && Array.isArray(data.jobs)) setCronInfo({ jobs: data.jobs, logs: data.logs || [] });
    } catch (err) {
      if (!silent) console.error('Error fetching cron:', err);
    }
  };

  const handleCreateCron = async () => {
    if (!newCronName.trim()) return;
    try {
      const res = await adminFetch('/api/admin/system/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCronName.trim(),
          schedule: newCronSchedule.trim(),
          action_type: newCronType,
          action_payload: newCronPayload.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message });
        setShowAddCronModal(false);
        setNewCronName('');
        fetchCron(true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка создания крон-задачи' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteCron = async (id: string | number) => {
    try {
      const res = await adminFetch(`/api/admin/system/cron/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: data.message });
        fetchCron(true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка удаления задачи' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const handleRunCron = async (id: string | number) => {
    try {
      const res = await adminFetch(`/api/admin/system/cron/${id}/run`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatusMsg({ type: 'success', text: `Задача выполнена: ${data.message}` });
        fetchCron(true);
      } else {
        setStatusMsg({ type: 'error', text: data.error || 'Ошибка выполнения задачи' });
      }
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message });
    }
  };

  const fetchPosts = async () => {
    try {
      const res = await adminFetch('/api/posts');
      if (!res.ok) return;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const data = await res.json();
      if (data && Array.isArray(data.data)) setPostsList(data.data);
    } catch (err) {
      console.error('Error fetching posts:', err);
    }
  };

  const handleSavePost = async () => {
    try {
      const emptyForm = {
        title: '',
        slug: '',
        game_id: 'blitz',
        excerpt: '',
        content: '',
        image_url: DIRECT_MEDIA_URLS.GAME_BLITZ,
        seo_title: '',
        seo_description: '',
        seo_keywords: '',
        cover_prompt: '',
        author_name: 'Редакция КвИИз',
        platforms: 'app',
        scheduled_at: ''
      };
      if (editingPost) {
        const res = await adminFetch(`/api/posts/${editingPost.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postForm)
        });
        if (res.ok) {
          setStatusMsg({ type: 'success', text: 'Статья блога успешно обновлена и зафиксирована в БД' });
          setEditingPost(null);
          setPostForm(emptyForm);
          fetchPosts();
        }
      } else {
        const res = await adminFetch('/api/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postForm)
        });
        if (res.ok) {
          setStatusMsg({ type: 'success', text: 'Новая SEO-статья опубликована и зафиксирована в БД' });
          setPostForm(emptyForm);
          fetchPosts();
        }
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message });
    }
  };

  const handleDeletePost = async (id: number) => {
    try {
      const res = await adminFetch(`/api/posts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setStatusMsg({ type: 'success', text: 'Пост удален' });
        fetchPosts();
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message });
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await adminFetch('/api/admin/system/logs');
      if (!res.ok) return;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return;
      const data = await res.json();
      const logs = data.logs || data.data;
      if (Array.isArray(logs)) setLogsList(logs);
    } catch (err) {
      console.error('Error fetching logs:', err);
    }
  };

  const fetchPrompts = async () => {
    setPromptsLoading(true);
    try {
      const res = await adminFetch('/api/admin/prompts');
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setPrompts(json.data);
          setPromptsList(json.list || []);
          setPromptsDirty({});
        }
      }
    } catch (err) {
      console.error('Error fetching prompts:', err);
    } finally {
      setPromptsLoading(false);
    }
  };

  const handleSavePrompt = async (gameId: string) => {
    setPromptsSavingKey(gameId);
    try {
      const content = prompts[gameId];
      const descItem = promptsList.find(p => p.game_id === gameId);
      const res = await adminFetch(`/api/admin/prompts/${encodeURIComponent(gameId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, description: descItem?.description })
      });
      if (!res.ok) throw new Error('Ошибка сохранения промпта');
      setPromptsDirty(prev => ({ ...prev, [gameId]: false }));
      showNotification(`Промпт «${gameId}» зафиксирован в базе данных`);
      await fetchPrompts();
    } catch (err: any) {
      showNotification(err.message || 'Ошибка сохранения промпта', 'error');
    } finally {
      setPromptsSavingKey(null);
    }
  };

  const handleSaveAllPrompts = async () => {
    setPromptsSavingKey('all');
    try {
      const res = await adminFetch('/api/admin/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompts })
      });
      if (!res.ok) throw new Error('Ошибка сохранения промптов');
      setPromptsDirty({});
      showNotification('Все промпты зафиксированы в базе данных');
      await fetchPrompts();
    } catch (err: any) {
      showNotification(err.message || 'Ошибка сохранения промптов', 'error');
    } finally {
      setPromptsSavingKey(null);
    }
  };

  const handleResetPrompts = async (gameId?: string) => {
    const confirmText = gameId
      ? `Сбросить промпт «${gameId}» к улучшенному эталонному шаблону?`
      : 'Сбросить все промпты к улучшенным эталонным шаблонам?';
    if (!window.confirm(confirmText)) return;
    try {
      const res = await adminFetch('/api/admin/prompts/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: gameId })
      });
      if (!res.ok) throw new Error('Ошибка сброса');
      const data = await res.json();
      if (data?.data) {
        setPrompts(data.data);
        setPromptsList(data.list || []);
        setPromptsDirty({});
      }
      showNotification(gameId ? `Промпт «${gameId}» сброшен к эталону` : 'Все промпты сброшены к улучшенным эталонам');
    } catch (err: any) {
      showNotification(err.message || 'Ошибка сброса', 'error');
    }
  };

  const insertMacroIntoPrompt = (gameId: string, macro: string) => {
    const current = prompts[gameId] || '';
    const updated = current + (current.endsWith(' ') || current.endsWith('\n') ? '' : ' ') + macro;
    setPrompts(prev => ({ ...prev, [gameId]: updated }));
    setPromptsDirty(prev => ({ ...prev, [gameId]: true }));
  };

  const handleTestPrompt = async (gameId: string) => {
    let rawPrompt = prompts[gameId] || '';
    if (!rawPrompt) return;
    Object.entries(promptTestVariables).forEach(([key, val]) => {
      rawPrompt = rawPrompt.replace(new RegExp(`{${key}}`, 'g'), val);
    });
    setIsTestingPrompt(true);
    setPromptTestResult(null);
    try {
      const activeUserId = localStorage.getItem('qaiz_active_user_id') || localStorage.getItem('user_id') || 'usr_169262990';
      const res = await adminFetch('/api/protalk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: rawPrompt,
          mode: gameId,
          user_id: activeUserId,
          game_id: gameId,
          count: parseInt(promptTestVariables.count || '1') || 1
        })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setPromptTestResult(typeof data.response === 'string' ? data.response : JSON.stringify(data.response, null, 2));
      showNotification('Ответ ProTalk успешно получен');
    } catch (err: any) {
      setPromptTestResult(`Ошибка: ${err.message}`);
      showNotification(err.message || 'Ошибка генерации', 'error');
    } finally {
      setIsTestingPrompt(false);
    }
  };

  const uniquePlayers = useMemo(() => {
    const s = new Set<string>();
    logsList.forEach(l => {
      const pid = String(l.user_social_id || l.user_id || '').trim();
      if (pid) s.add(pid);
    });
    return Array.from(s).sort();
  }, [logsList]);

  const uniqueGames = useMemo(() => {
    const s = new Set<string>();
    logsList.forEach(l => {
      const gid = String(l.channel_id || l.channel_name || '').trim();
      if (gid) s.add(gid);
    });
    return Array.from(s).sort();
  }, [logsList]);

  const filteredLogs = useMemo(() => {
    return logsList.filter(log => {
      if (selectedPlayerFilter !== 'all' && String(log.user_social_id || log.user_id || '').trim() !== selectedPlayerFilter)
        return false;
      if (selectedGameFilter !== 'all' && String(log.channel_id || log.channel_name || '').trim() !== selectedGameFilter)
        return false;
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        return (
          String(log.id || '').includes(q) ||
          String(log.user_message || '').toLowerCase().includes(q) ||
          String(log.bot_reply || '').toLowerCase().includes(q) ||
          String(log.user_social_id || '').toLowerCase().includes(q) ||
          String(log.channel_name || '').toLowerCase().includes(q) ||
          String(log.channel_id || '').toLowerCase().includes(q) ||
          String(log.bot_id || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logsList, selectedPlayerFilter, selectedGameFilter, logSearchQuery]);

  const totalFilteredTokens = useMemo(
    () =>
      filteredLogs.reduce(
        (acc, l) =>
          acc +
          (Number(l.tokens_total) ||
            Number(l.tokens_in_source || 0) + Number(l.tokens_out_source || 0) ||
            (l.user_message?.length || 0) + (l.bot_reply?.length || 0) ||
            0),
        0
      ),
    [filteredLogs]
  );

  const totalFilteredRub = useMemo(() => filteredLogs.reduce((acc, l) => acc + (Number(l.rub) || 0), 0), [filteredLogs]);

  return {
    triggers,
    fetchTriggers,
    showAddTriggerModal,
    setShowAddTriggerModal,
    newTriggerSql,
    setNewTriggerSql,
    handleCreateTrigger,
    handleDeleteTrigger,
    cronInfo,
    fetchCron,
    showAddCronModal,
    setShowAddCronModal,
    newCronName,
    setNewCronName,
    newCronSchedule,
    setNewCronSchedule,
    newCronType,
    setNewCronType,
    newCronPayload,
    setNewCronPayload,
    handleCreateCron,
    handleDeleteCron,
    handleRunCron,
    postsList,
    fetchPosts,
    editingPost,
    setEditingPost,
    postForm,
    setPostForm,
    handleSavePost,
    handleDeletePost,
    logsList,
    fetchLogs,
    selectedLog,
    setSelectedLog,
    logSearchQuery,
    setLogSearchQuery,
    selectedPlayerFilter,
    setSelectedPlayerFilter,
    selectedGameFilter,
    setSelectedGameFilter,
    isTestingProTalk,
    setIsTestingProTalk,
    testPromptInput,
    setTestPromptInput,
    testPromptResult,
    setTestPromptResult,
    uniquePlayers,
    uniqueGames,
    filteredLogs,
    totalFilteredTokens,
    totalFilteredRub,
    prompts,
    setPrompts,
    promptsList,
    promptsLoading,
    promptsSearchQuery,
    setPromptsSearchQuery,
    promptsSavingKey,
    promptsDirty,
    setPromptsDirty,
    selectedPromptForTest,
    setSelectedPromptForTest,
    promptTestVariables,
    setPromptTestVariables,
    promptTestResult,
    isTestingPrompt,
    fetchPrompts,
    handleSavePrompt,
    handleSaveAllPrompts,
    handleResetPrompts,
    insertMacroIntoPrompt,
    handleTestPrompt
  };
}
