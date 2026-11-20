import React, { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, MessageSquarePlus, X, Check } from 'lucide-react';
import { BubbleElement } from './BubbleElement';
import { VoiceInputBubble } from './VoiceInputBubble';

export interface PromptStyleTemplate {
  id: string;
  label: string;
  prompt: string;
  icon?: string;
  description?: string;
}

export const PROMPT_STYLE_TEMPLATES: PromptStyleTemplate[] = [
  {
    id: 'humor',
    label: 'Юмористический',
    prompt: 'Сделай вопросы с легким остроумным юмором, иронией, забавными жизненными ситуациями и неожиданными курьезными фактами, которые вызывают улыбку.'
  },
  {
    id: 'hardcore',
    label: 'Усложненный',
    prompt: 'Сделай вопросы повышенной интеллектуальной сложности для опытных знатоков: с многоходовой логикой, редкими фактами и глубокими причинно-следственными связями.'
  },
  {
    id: 'no_school',
    label: 'Без школы',
    prompt: 'Полностью исключи скучные школьные вопросы из учебников, формулы, зубрежку дат и банальную классику. Используй только живые, современные и нетривиальные факты из реальной жизни.'
  },
  {
    id: 'kids',
    label: 'Детский',
    prompt: 'Сделай вопросы добрыми, понятными, увлекательными и познавательными для детей и семейной игры: про удивительных животных, сказки, мультфильмы, природу и изобретения.'
  },
  {
    id: 'spicy_18',
    label: '18+ пикантный',
    prompt: 'Добавь взрослый, дерзкий, пикантный и игривый оттенок (18+) для взрослой вечеринки: про страсти, интриги, отношения и ночную жизнь.'
  },
  {
    id: 'business',
    label: 'Бизнес-стиль',
    prompt: 'Сфокусируй вопросы вокруг предпринимательства, финансов, переговоров, историй успеха мировых корпораций, стартапов, маркетинга, лидерства и экономики.'
  },
  {
    id: 'geek_pop',
    label: 'Гик и поп-культура',
    prompt: 'Сделай акцент на современной поп-культуре, видеоиграх, культовом кино, сериалах, аниме, комиксах, интернет-феноменах и цифровых технологиях.'
  },
  {
    id: 'scipop',
    label: 'Научпоп и космос',
    prompt: 'Построй вопросы вокруг захватывающих открытий астрофизики, космоса, биотехнологий, работы мозга, психологии человека, футурологии и парадоксальных научных экспериментов.'
  },
  {
    id: 'sport_drive',
    label: 'Спортивно-азартный',
    prompt: 'Добавь дух азарта и соперничества: легендарные мировые рекорды, невероятные камбэки, курьезы большого спорта, киберспорта, Олимпиад и экстремальных достижений.'
  },
  {
    id: 'detective',
    label: 'Детективно-загадочный',
    prompt: 'Сформулируй вопросы в стиле захватывающих детективных загадок, таинственных происшествий, исторических шифров, расследований и неожиданных логических развязок.'
  }
];

let cachedDbStyleTemplates: PromptStyleTemplate[] | null = null;

export interface MiniAudioFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  multiline?: boolean;
  rows?: number;
}

export const MiniAudioField: React.FC<MiniAudioFieldProps> = ({
  value,
  onChange,
  label = 'Примечание к игре (дополнение в промпт ИИ)',
  placeholder = 'Опишите свои пожелания к вопросам (или надиктуйте голосом / выберите шаблон стиля ниже)...',
  disabled = false,
  className = '',
  rows = 2
}) => {
  const safeValue = typeof value === 'string' ? value : '';
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const [isStylesOpen, setIsStylesOpen] = useState(false);
  const [templates, setTemplates] = useState<PromptStyleTemplate[]>(
    cachedDbStyleTemplates && cachedDbStyleTemplates.length > 0 ? cachedDbStyleTemplates : PROMPT_STYLE_TEMPLATES
  );

  useEffect(() => {
    let mounted = true;
    fetch('/api/prompts/note-styles')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!mounted || !json || !Array.isArray(json.data) || json.data.length === 0) return;
        const mapped: PromptStyleTemplate[] = json.data
          .filter((row: any) => row && row.id && (row.prompt_text || row.prompt))
          .map((row: any) => ({
            id: String(row.id),
            label: String(row.label || row.id),
            prompt: String(row.prompt_text || row.prompt || ''),
            icon: row.icon ? String(row.icon) : undefined,
            description: row.description ? String(row.description) : undefined
          }));
        if (mapped.length > 0) {
          cachedDbStyleTemplates = mapped;
          setTemplates(mapped);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const activeStyle = templates.find(
    (tpl) => safeValue.trim() === tpl.prompt.trim() || (tpl.prompt && safeValue.includes(tpl.prompt))
  );

  const handleSelectTemplate = (tpl: PromptStyleTemplate) => {
    if (disabled) return;
    if (safeValue.trim() === tpl.prompt.trim()) {
      onChangeRef.current('');
    } else {
      onChangeRef.current(tpl.prompt);
    }
    setIsStylesOpen(false);
  };

  const isToggleActive = isStylesOpen || Boolean(activeStyle);

  return (
    <div className={`relative w-full min-w-0 space-y-3 rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl p-3.5 sm:p-5 transition-all ${className}`}>
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
        <label className="text-sm font-bold text-primary flex items-center gap-2 min-w-0">
          <MessageSquarePlus size={18} className="text-primary shrink-0" />
          <span className="break-words">{label}</span>
        </label>

        {safeValue.trim().length > 0 && !disabled && (
          <BubbleElement
            size="sm"
            onClick={() => onChangeRef.current('')}
            icon={<X size={14} />}
            className="text-sm shrink-0"
            title="Очистить примечание"
          >
            <span>Очистить</span>
          </BubbleElement>
        )}
      </div>

      {/* Text Input + Voice Module Row */}
      <div className="flex items-start gap-2.5 w-full min-w-0">
        <div className="relative flex-1 min-w-0">
          <textarea
            value={safeValue}
            onChange={(e) => onChangeRef.current(e.target.value)}
            disabled={disabled}
            rows={rows}
            placeholder={placeholder}
            className="w-full rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/45 focus:outline-none focus:border-primary transition-all resize-y min-h-[56px]"
          />
        </div>

        <div className="shrink-0 pt-0.5">
          <VoiceInputBubble
            onTranscript={(transcript) => onChangeRef.current(transcript)}
            disabled={disabled}
            currentValue={safeValue}
            mode="append"
            size="md"
            tooltip="🎤 Начать запись"
          />
        </div>
      </div>

      {/* Collapsible Vertical Dropdown on Mobile / 2-Column Grid on Desktop of Prompt Style Bubbles */}
      <div className="space-y-2.5 pt-1 w-full min-w-0 overflow-hidden">
        <BubbleElement
          size="md"
          active={isToggleActive}
          onClick={() => !disabled && setIsStylesOpen((prev) => !prev)}
          className="w-full justify-between px-3.5 sm:px-4 py-2.5 text-sm font-bold rounded-2xl"
          icon={<Sparkles size={16} className={`shrink-0 ${isToggleActive ? 'text-black' : 'text-primary'}`} />}
        >
          <div className="flex items-center justify-between w-full gap-2 min-w-0">
            <span className="text-sm text-left break-words min-w-0 leading-snug">
              {activeStyle
                ? `Стиль промпта: ${activeStyle.label}`
                : `Шаблоны стилей мини-промптов (${templates.length})`}
            </span>
            <span className={`shrink-0 flex items-center gap-1 ${isToggleActive ? 'text-black font-black' : 'text-primary font-semibold'}`}>
              <span className="text-sm">
                {isStylesOpen ? 'Свернуть' : 'Выбрать'}
              </span>
              {isStylesOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </div>
        </BubbleElement>

        {isStylesOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 w-full min-w-0 overflow-hidden">
            {templates.map((tpl) => {
              const isSelected = safeValue.trim() === tpl.prompt.trim();
              return (
                <BubbleElement
                  key={tpl.id}
                  size="md"
                  active={isSelected}
                  onClick={() => handleSelectTemplate(tpl)}
                  className="w-full justify-start text-left px-3.5 py-2.5 rounded-2xl min-w-0"
                >
                  <div className="flex items-center justify-between gap-2 w-full min-w-0">
                    <span className={`text-sm font-black flex items-center gap-1.5 min-w-0 ${isSelected ? 'text-black' : 'text-primary'}`}>
                      <Sparkles size={14} className="shrink-0" />
                      <span className="break-words min-w-0 leading-snug">{tpl.label}</span>
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 text-sm font-black text-black shrink-0">
                        <Check size={14} />
                        <span>Выбрано</span>
                      </span>
                    )}
                  </div>
                </BubbleElement>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniAudioField;
