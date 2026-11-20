import React from 'react';
import {
  Terminal,
  RefreshCw,
  Sparkles,
  Send,
  X,
  Search,
  RotateCcw,
  Copy
} from 'lucide-react';
import { Function763ModerationManager } from '../../Function763ModerationManager';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';

interface AdminLogsSectionProps {
  logsList: any[];
  filteredLogs: any[];
  uniquePlayers: string[];
  uniqueGames: string[];
  selectedPlayerFilter: string;
  setSelectedPlayerFilter: (v: string) => void;
  selectedGameFilter: string;
  setSelectedGameFilter: (v: string) => void;
  logSearchQuery: string;
  setLogSearchQuery: (v: string) => void;
  totalFilteredTokens: number;
  totalFilteredRub: number;
  selectedLog: any | null;
  setSelectedLog: (v: any | null) => void;
  isTestingProTalk: boolean;
  setIsTestingProTalk: (v: boolean) => void;
  testPromptInput: string;
  setTestPromptInput: (v: string) => void;
  testPromptResult: any;
  setTestPromptResult: (v: any) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  adminFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  fetchLogs: () => Promise<void>;
  showNotification: (text: string, type?: 'success' | 'error') => void;
}

export const AdminLogsSection: React.FC<AdminLogsSectionProps> = ({
  logsList,
  filteredLogs,
  uniquePlayers,
  uniqueGames,
  selectedPlayerFilter,
  setSelectedPlayerFilter,
  selectedGameFilter,
  setSelectedGameFilter,
  logSearchQuery,
  setLogSearchQuery,
  totalFilteredTokens,
  totalFilteredRub,
  selectedLog,
  setSelectedLog,
  isTestingProTalk,
  setIsTestingProTalk,
  testPromptInput,
  setTestPromptInput,
  testPromptResult,
  setTestPromptResult,
  loading,
  setLoading,
  adminFetch,
  fetchLogs,
  showNotification
}) => {
  const sendProTalkTest = async () => {
    if (!testPromptInput.trim()) return;
    setLoading(true);
    try {
      const res = await adminFetch('/api/protalk/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: testPromptInput, social_id: 'admin_test_qaiz' })
      });
      const data = await res.json();
      setTestPromptResult(data);
      await fetchLogs();
    } catch (err: any) {
      setTestPromptResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <Function763ModerationManager onRefreshLogs={fetchLogs} />

        <div className="p-6 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Terminal size={22} className="text-primary" />
                <span>Логи нейросети ProTalk</span>
              </h3>
              <p className="text-sm text-foreground/75 mt-1">
                История обращений к AI, промпты пользователей, ответы нейросети, подсчет токенов и расходы (Канал: qaiz, Бот ID: 60381)
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <BubbleElement
                size="md"
                onClick={fetchLogs}
                icon={<RefreshCw size={16} className="text-primary" />}
                className="!text-sm"
                title="Обновить список логов"
              >
                <span>Обновить</span>
              </BubbleElement>
              <LeafButton
                variant="primary"
                size="sm"
                onClick={() => setIsTestingProTalk(!isTestingProTalk)}
                icon={<Sparkles size={16} />}
              >
                <span>Тест ProTalk</span>
              </LeafButton>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20">
              <div className="text-sm text-foreground/70 font-semibold">Всего запросов</div>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {filteredLogs.length}
                {filteredLogs.length !== logsList.length && (
                  <span className="text-sm text-foreground/55 font-normal ml-1">из {logsList.length}</span>
                )}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20">
              <div className="text-sm text-foreground/70 font-semibold">Суммарно токенов</div>
              <div className="text-xl font-bold text-primary mt-0.5">
                {totalFilteredTokens.toLocaleString('ru-RU')}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20">
              <div className="text-sm text-foreground/70 font-semibold">Общий расход</div>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {totalFilteredRub.toFixed(4)} ₽
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20">
              <div className="text-sm text-foreground/70 font-semibold">Средний чек</div>
              <div className="text-sm font-bold text-foreground truncate mt-1">
                {filteredLogs.length > 0 ? (totalFilteredRub / filteredLogs.length).toFixed(4) : '0.0000'} ₽ / запрос
              </div>
            </div>
          </div>

          {isTestingProTalk && (
            <div className="p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/35 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Send size={15} className="text-primary" />
                  <span>Отправить тестовое сообщение в ProTalk:</span>
                </span>
                <BubbleElement size="sm" onClick={() => setIsTestingProTalk(false)} icon={<X size={16} />} />
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={testPromptInput}
                  onChange={(e) => setTestPromptInput(e.target.value)}
                  placeholder="Введите текст запроса, например: Привет, сгенерируй вопрос для квиза..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') sendProTalkTest();
                  }}
                />
                <LeafButton
                  variant="primary"
                  size="sm"
                  onClick={sendProTalkTest}
                  disabled={loading || !testPromptInput.trim()}
                >
                  <span>{loading ? 'Отправка...' : 'Отправить'}</span>
                </LeafButton>
              </div>
              {testPromptResult && (
                <div className="p-3 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono max-h-40 overflow-y-auto">
                  <span className="text-foreground/60">Ответ API: </span>
                  <span className="text-foreground">{JSON.stringify(testPromptResult, null, 2)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/45" />
              <input
                type="text"
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                placeholder="Поиск по сообщениям, ответам, пользователю, боту или каналу..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary"
              />
              {logSearchQuery && (
                <button
                  onClick={() => setLogSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="w-full md:w-52">
              <select
                value={selectedPlayerFilter}
                onChange={(e) => setSelectedPlayerFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all" className="bg-zinc-900 text-foreground">Все игроки ({uniquePlayers.length})</option>
                {uniquePlayers.map((player) => (
                  <option key={player} value={player} className="bg-zinc-900 text-foreground">
                    {player}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full md:w-52">
              <select
                value={selectedGameFilter}
                onChange={(e) => setSelectedGameFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
              >
                <option value="all" className="bg-zinc-900 text-foreground">Все игры / каналы ({uniqueGames.length})</option>
                {uniqueGames.map((game) => (
                  <option key={game} value={game} className="bg-zinc-900 text-foreground">
                    {game}
                  </option>
                ))}
              </select>
            </div>

            {(selectedPlayerFilter !== 'all' || selectedGameFilter !== 'all' || logSearchQuery) && (
              <BubbleElement
                size="sm"
                onClick={() => {
                  setSelectedPlayerFilter('all');
                  setSelectedGameFilter('all');
                  setLogSearchQuery('');
                }}
                icon={<RotateCcw size={14} />}
                className="shrink-0 !text-sm font-semibold"
              >
                Сброс
              </BubbleElement>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-left text-sm font-sans">
              <thead className="sticky top-0 backdrop-blur-2xl border-b border-primary/20 text-foreground/80 font-bold">
                <tr>
                  <th className="p-3.5 text-sm">ID / Время</th>
                  <th className="p-3.5 text-sm">Канал / Бот</th>
                  <th className="p-3.5 text-sm">Пользователь (social id)</th>
                  <th className="p-3.5 text-sm min-w-[220px]">Сообщение пользователя</th>
                  <th className="p-3.5 text-sm min-w-[220px]">Ответ ProTalk AI</th>
                  <th className="p-3.5 text-sm text-center">Токены</th>
                  <th className="p-3.5 text-sm text-primary font-bold">Расход</th>
                  <th className="p-3.5 text-sm text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary/10">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map(log => {
                    const safeTokens =
                      Number(log.tokens_total) ||
                      Number(log.tokens_in_source || 0) + Number(log.tokens_out_source || 0) ||
                      (log.user_message?.length || 0) + (log.bot_reply?.length || 0) ||
                      0;
                    const safeRub = typeof log.rub === 'number' && Number.isFinite(log.rub) ? log.rub : Number(log.rub) || 0;

                    return (
                      <tr key={log.id} className="hover:bg-primary/5 transition-colors">
                        <td className="p-3.5 text-sm font-mono">
                          <div className="font-bold text-foreground">#{log.id}</div>
                          <div className="text-sm text-foreground/60 mt-0.5">
                            {new Date(log.created_at || Date.now()).toLocaleString('ru-RU')}
                          </div>
                        </td>
                        <td className="p-3.5 text-sm">
                          <div className="font-semibold text-foreground">{log.channel_name || 'qaiz'}</div>
                          <div className="text-sm text-foreground/60 font-mono">Бот: {log.bot_id || '60381'}</div>
                        </td>
                        <td className="p-3.5 text-sm font-mono max-w-[160px] truncate text-foreground/75" title={log.user_social_id}>
                          {log.user_social_id || log.user_id || 'system'}
                        </td>
                        <td className="p-3.5 text-sm text-foreground max-w-[260px]">
                          <div
                            className="line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setSelectedLog(log)}
                            title="Нажмите для просмотра полного текста"
                          >
                            {log.user_message || <span className="text-foreground/45 italic">Запрос не указан</span>}
                          </div>
                        </td>
                        <td className="p-3.5 text-sm text-foreground/90 max-w-[260px]">
                          <div
                            className="line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                            onClick={() => setSelectedLog(log)}
                            title="Нажмите для просмотра полного текста"
                          >
                            {log.bot_reply || (
                              log.function_error ? (
                                <span className="text-foreground/80 italic">Ошибка: {log.function_error}</span>
                              ) : (
                                <span className="text-foreground/45 italic">Нет ответа</span>
                              )
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-sm text-center font-mono font-semibold text-foreground/85">
                          {safeTokens}
                        </td>
                        <td className="p-3.5 text-sm font-mono font-bold text-primary">
                          {safeRub > 0 ? safeRub.toFixed(4) : '0.0000'}
                        </td>
                        <td className="p-3.5 text-right">
                          <BubbleElement size="sm" onClick={() => setSelectedLog(log)} className="!text-sm">
                            Подробнее
                          </BubbleElement>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-sm text-foreground/50 italic">
                      Логи ProTalk пока отсутствуют
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-transparent backdrop-blur-2xl p-4 animate-in fade-in">
          <div className="w-full max-w-3xl rounded-3xl border border-primary/35 bg-transparent backdrop-blur-3xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-primary/20 pb-3">
              <div>
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Terminal size={20} className="text-primary" />
                  <span>Лог обращения ProTalk #{selectedLog.id}</span>
                </h3>
                <p className="text-sm text-foreground/65 mt-0.5">
                  Канал: {selectedLog.channel_name || 'qaiz'} • Бот ID: {selectedLog.bot_id || '60381'} • Время:{' '}
                  {new Date(selectedLog.created_at || Date.now()).toLocaleString('ru-RU')}
                </p>
              </div>
              <BubbleElement size="sm" onClick={() => setSelectedLog(null)} icon={<X size={18} />} />
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm font-bold text-foreground/80">
                  <span>Сообщение пользователя (Промпт):</span>
                  <BubbleElement
                    size="sm"
                    onClick={() => {
                      if (selectedLog.user_message) {
                        navigator.clipboard.writeText(selectedLog.user_message);
                        showNotification('Сообщение скопировано');
                      }
                    }}
                    icon={<Copy size={13} />}
                    className="!text-sm text-primary"
                  >
                    <span>Скопировать</span>
                  </BubbleElement>
                </div>
                <div className="p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/20 text-sm text-foreground font-sans leading-relaxed whitespace-pre-wrap">
                  {selectedLog.user_message || 'Нет сообщения'}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm font-bold text-foreground/80">
                  <span>Ответ нейросети ProTalk:</span>
                  <BubbleElement
                    size="sm"
                    onClick={() => {
                      if (selectedLog.bot_reply) {
                        navigator.clipboard.writeText(selectedLog.bot_reply);
                        showNotification('Ответ нейросети скопирован');
                      }
                    }}
                    icon={<Copy size={13} />}
                    className="!text-sm text-primary"
                  >
                    <span>Скопировать</span>
                  </BubbleElement>
                </div>
                <div className="p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm text-foreground font-sans leading-relaxed whitespace-pre-wrap">
                  {selectedLog.bot_reply || 'Нет ответа'}
                </div>
              </div>

              {selectedLog.function_error && (
                <div className="p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm text-foreground">
                  <div className="font-bold text-primary">Ошибка:</div>
                  <div className="font-mono mt-1 text-foreground/85">{selectedLog.function_error}</div>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-sm">
                <div className="p-3 rounded-xl bg-transparent backdrop-blur-xl border border-primary/20">
                  <span className="text-foreground/60 block">Токены всего:</span>
                  <span className="font-bold font-mono text-sm text-foreground">
                    {selectedLog.tokens_total ?? (selectedLog.user_message?.length || 0) + (selectedLog.bot_reply?.length || 0)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-transparent backdrop-blur-xl border border-primary/20">
                  <span className="text-foreground/60 block">Расход:</span>
                  <span className="font-bold font-mono text-sm text-primary">
                    {selectedLog.rub ? Number(selectedLog.rub).toFixed(4) : '0.0000'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-transparent backdrop-blur-xl border border-primary/20">
                  <span className="text-foreground/60 block">Social ID:</span>
                  <span className="font-mono text-sm text-foreground truncate block" title={selectedLog.user_social_id}>
                    {selectedLog.user_social_id || 'system'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-transparent backdrop-blur-xl border border-primary/20">
                  <span className="text-foreground/60 block">Сервер / LLM:</span>
                  <span className="font-mono text-sm text-foreground truncate block">
                    {selectedLog.server_name || 'miniapp'} • {selectedLog.llm || 'protalk'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-primary/15">
              <BubbleElement size="md" active onClick={() => setSelectedLog(null)}>
                Закрыть
              </BubbleElement>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
