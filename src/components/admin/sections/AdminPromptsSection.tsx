import React from 'react';
import {
  Sparkles,
  RefreshCw,
  RotateCcw,
  Save,
  Sliders,
  Search,
  X,
  Play,
  Copy
} from 'lucide-react';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';

interface PromptMetaItem {
  game_id: string;
  content: string;
  description?: string;
  updated_at?: string;
}

interface AdminPromptsSectionProps {
  prompts: Record<string, string>;
  setPrompts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  promptsList: PromptMetaItem[];
  promptsLoading: boolean;
  promptsSearchQuery: string;
  setPromptsSearchQuery: (v: string) => void;
  promptsSavingKey: string | null;
  promptsDirty: Record<string, boolean>;
  setPromptsDirty: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedPromptForTest: string | null;
  setSelectedPromptForTest: (v: string | null) => void;
  promptTestVariables: Record<string, string>;
  setPromptTestVariables: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  promptTestResult: string | null;
  isTestingPrompt: boolean;
  fetchPrompts: () => void;
  handleResetPrompts: (gameId?: string) => void;
  handleSaveAllPrompts: () => void;
  handleSavePrompt: (gameId: string) => void;
  insertMacroIntoPrompt: (gameId: string, macro: string) => void;
  handleTestPrompt: (gameId: string) => void;
  showNotification: (text: string, type?: 'success' | 'error') => void;
}

const MACRO_DOCS = [
  { tag: '{topic}', desc: 'название темы' },
  { tag: '{topic_desc}', desc: 'описание темы' },
  { tag: '{note}', desc: 'примечание для ИИ' },
  { tag: '{diffDesc}', desc: 'название и уровень сложности' },
  { tag: '{diffInstructions}', desc: 'подробные инструкции сложности' },
  { tag: '{count}', desc: 'число вопросов' },
  { tag: '{level}', desc: 'уровень 1-15' },
  { tag: '{difficulty}', desc: 'id сложности' },
  { tag: '{categoryName}', desc: 'категория' },
  { tag: '{values}', desc: 'номиналы' },
  { tag: '{categoriesJson}', desc: 'json категорий' },
  { tag: '{roundNum}', desc: 'номер раунда' },
  { tag: '{question}', desc: 'вопрос' },
  { tag: '{correctAnswer}', desc: 'правильный ответ' },
  { tag: '{userAnswer}', desc: 'ответ игрока' },
  { tag: '{personality}', desc: 'характер ИИ' },
  { tag: '{event}', desc: 'событие' }
];

const QUICK_MACROS = [
  '{topic}',
  '{topic_desc}',
  '{note}',
  '{diffDesc}',
  '{diffInstructions}',
  '{count}',
  '{level}',
  '{question}',
  '{correctAnswer}',
  '{userAnswer}'
];

export const AdminPromptsSection: React.FC<AdminPromptsSectionProps> = ({
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
  handleResetPrompts,
  handleSaveAllPrompts,
  handleSavePrompt,
  insertMacroIntoPrompt,
  handleTestPrompt,
  showNotification
}) => {
  return (
    <div className="space-y-6">
      <div className="p-6 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Sparkles size={22} className="text-primary" />
              <span>Шаблоны системных промптов нейросети ProTalk</span>
            </h3>
            <p className="text-sm text-foreground/75 mt-1">
              Синхронизированы с базой данных на сервере и защищены от потерь. Поддерживают макросы сложности, описаний тем и параметров генерации.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <BubbleElement
              size="md"
              onClick={fetchPrompts}
              disabled={promptsLoading}
              icon={<RefreshCw size={16} className={promptsLoading ? 'animate-spin text-primary' : 'text-primary'} />}
              className="!text-sm"
              title="Обновить данные из БД"
            >
              <span>Обновить</span>
            </BubbleElement>

            <BubbleElement
              size="md"
              onClick={() => handleResetPrompts()}
              icon={<RotateCcw size={16} className="text-primary" />}
              className="!text-sm"
              title="Сбросить все промпты к улучшенным эталонным шаблонам"
            >
              <span>Сбросить к эталонам</span>
            </BubbleElement>

            <LeafButton
              variant="primary"
              size="sm"
              onClick={handleSaveAllPrompts}
              disabled={promptsSavingKey === 'all'}
              icon={<Save size={16} />}
            >
              <span>{promptsSavingKey === 'all' ? 'Сохранение...' : 'Сохранить все в БД'}</span>
            </LeafButton>
          </div>
        </div>

        <div className="pt-3 border-t border-primary/20">
          <div className="flex items-center gap-2 mb-2 text-sm font-bold text-foreground/85">
            <Sliders size={16} className="text-primary" />
            <span>Доступные макросы (нажмите на макрос под промптом для вставки):</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-sm">
            {MACRO_DOCS.map(item => (
              <BubbleElement
                key={item.tag}
                isBadge
                size="sm"
                className="!text-sm font-mono"
                title={item.desc}
              >
                <span className="font-bold text-primary">{item.tag}</span>
                <span className="text-foreground/70 font-sans ml-1">({item.desc})</span>
              </BubbleElement>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/45" />
          <input
            type="text"
            value={promptsSearchQuery}
            onChange={(e) => setPromptsSearchQuery(e.target.value)}
            placeholder="Поиск по названию или тексту..."
            className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary transition-all"
          />
          {promptsSearchQuery && (
            <button
              onClick={() => setPromptsSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/45 hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-sm font-bold text-foreground/80">
          <BubbleElement isBadge size="sm" className="!text-sm">
            Всего в базе: {Object.keys(prompts).length}
          </BubbleElement>
          {Object.values(promptsDirty).some(Boolean) && (
            <BubbleElement isBadge active size="sm" className="!text-sm">
              Есть несохраненные изменения
            </BubbleElement>
          )}
        </div>
      </div>

      <div className="grid gap-6">
        {Object.entries(prompts)
          .filter(([key, text]) => {
            if (!promptsSearchQuery.trim()) return true;
            const q = promptsSearchQuery.toLowerCase();
            const desc = promptsList.find(p => p.game_id === key)?.description || '';
            return key.toLowerCase().includes(q) || text.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
          })
          .map(([key, promptText]) => {
            const dbMeta = promptsList.find(p => p.game_id === key);
            const isDirty = promptsDirty[key];
            const isSaving = promptsSavingKey === key;
            const charCount = (promptText || '').length;
            const estTokens = Math.round(charCount / 3.5);

            return (
              <div
                key={key}
                className={`p-6 rounded-3xl border transition-all space-y-4 shadow-xl bg-transparent backdrop-blur-2xl ${
                  isDirty ? 'border-primary/50' : 'border-primary/20 hover:border-primary/40'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-base text-primary">{key}</span>
                      {isDirty && (
                        <BubbleElement isBadge active size="sm" className="!text-sm">
                          Изменен
                        </BubbleElement>
                      )}
                      {dbMeta?.updated_at && (
                        <span className="text-sm text-foreground/60">
                          Обновлен: {new Date(dbMeta.updated_at).toLocaleString('ru-RU')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/75 mt-0.5">
                      {dbMeta?.description || 'Системный шаблон генерации ProTalk'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <BubbleElement
                      size="sm"
                      active={selectedPromptForTest === key}
                      onClick={() => setSelectedPromptForTest(selectedPromptForTest === key ? null : key)}
                      icon={<Play size={15} />}
                      className="!text-sm"
                      title="Протестировать генерацию"
                    >
                      <span>Тест</span>
                    </BubbleElement>

                    <BubbleElement
                      size="sm"
                      onClick={() => handleResetPrompts(key)}
                      icon={<RotateCcw size={15} className="text-primary" />}
                      className="!text-sm"
                      title="Сбросить этот промпт к эталону"
                    >
                      <span>Эталон</span>
                    </BubbleElement>

                    <LeafButton
                      variant={isDirty ? 'primary' : 'glass'}
                      size="sm"
                      onClick={() => handleSavePrompt(key)}
                      disabled={isSaving}
                      icon={<Save size={15} />}
                    >
                      <span>{isSaving ? 'Сохранение...' : 'Сохранить'}</span>
                    </LeafButton>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm text-foreground/70 mr-1">Вставить:</span>
                  {QUICK_MACROS.map(m => (
                    <BubbleElement
                      key={m}
                      size="sm"
                      onClick={() => insertMacroIntoPrompt(key, m)}
                      className="!text-sm font-mono"
                      title={`Нажмите для вставки ${m} в конец текста`}
                    >
                      +{m}
                    </BubbleElement>
                  ))}
                </div>

                <textarea
                  value={promptText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrompts(prev => ({ ...prev, [key]: val }));
                    setPromptsDirty(prev => ({ ...prev, [key]: true }));
                  }}
                  className="w-full min-h-[160px] p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono text-foreground focus:outline-none focus:border-primary transition-all resize-y custom-scrollbar leading-relaxed"
                  placeholder="Введите шаблон промпта..."
                />

                <div className="flex items-center justify-between flex-wrap gap-2 text-sm text-foreground/70">
                  <span>Символов: {charCount} (~{estTokens} токенов)</span>
                  <span className="font-mono text-primary">game_id: {key}</span>
                </div>

                {selectedPromptForTest === key && (
                  <div className="mt-4 p-5 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Sparkles size={16} className="text-primary" />
                        <span>Тестовый запуск промпта «{key}» в нейросети ProTalk</span>
                      </h4>
                      <BubbleElement size="sm" onClick={() => setSelectedPromptForTest(null)} icon={<X size={16} />} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      <div>
                        <label className="block text-sm font-bold text-foreground/75 mb-1">Тема ({'{topic}'})</label>
                        <input
                          type="text"
                          value={promptTestVariables.topic || ''}
                          onChange={(e) => setPromptTestVariables(prev => ({ ...prev, topic: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-foreground/75 mb-1">Описание темы ({'{topic_desc}'})</label>
                        <input
                          type="text"
                          value={promptTestVariables.topic_desc || ''}
                          onChange={(e) => setPromptTestVariables(prev => ({ ...prev, topic_desc: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-foreground/75 mb-1">Сложность ({'{diffDesc}'})</label>
                        <input
                          type="text"
                          value={promptTestVariables.diffDesc || ''}
                          onChange={(e) => setPromptTestVariables(prev => ({ ...prev, diffDesc: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-foreground/75 mb-1">Инструкции ({'{diffInstructions}'})</label>
                        <input
                          type="text"
                          value={promptTestVariables.diffInstructions || ''}
                          onChange={(e) => setPromptTestVariables(prev => ({ ...prev, diffInstructions: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-foreground/75 mb-1">Количество ({'{count}'})</label>
                        <input
                          type="number"
                          value={promptTestVariables.count || '3'}
                          onChange={(e) => setPromptTestVariables(prev => ({ ...prev, count: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <LeafButton
                        variant="primary"
                        size="sm"
                        onClick={() => handleTestPrompt(key)}
                        disabled={isTestingPrompt}
                        icon={isTestingPrompt ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />}
                      >
                        <span>{isTestingPrompt ? 'Генерация ответа...' : 'Запустить тест в ProTalk AI'}</span>
                      </LeafButton>
                    </div>

                    {promptTestResult && (
                      <div className="p-4 rounded-xl bg-transparent backdrop-blur-xl border border-primary/25 text-sm font-mono space-y-2">
                        <div className="flex items-center justify-between text-sm font-bold text-foreground/75">
                          <span>Ответ нейросети ProTalk:</span>
                          <BubbleElement
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(promptTestResult);
                              showNotification('Ответ скопирован в буфер обмена');
                            }}
                            icon={<Copy size={13} />}
                            className="!text-sm text-primary"
                          >
                            <span>Копировать</span>
                          </BubbleElement>
                        </div>
                        <pre className="whitespace-pre-wrap max-h-72 overflow-y-auto custom-scrollbar text-foreground leading-relaxed">
                          {promptTestResult}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};
