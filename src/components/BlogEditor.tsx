import React, { useState, useRef } from 'react';
import Markdown from 'react-markdown';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Eye,
  Edit3,
  Upload,
  Loader2,
  Sparkles,
  Check,
  Copy,
  Trash2,
  Send,
  FileText,
  Wand2,
  Search,
  Palette
} from 'lucide-react';
import { FileUploadService } from '../services/FileUploadService';
import { protalkService } from '../services/protalk';
import { LeafButton } from './ui/LeafButton';
import { BubbleElement } from './ui/BubbleElement';
import { MiniAudioField } from './ui/MiniAudioField';
import { BlogArticleContent } from './BlogArticleContent';

export interface BlogPostFormState {
  title: string;
  slug?: string;
  game_id?: string;
  excerpt?: string;
  content: string;
  image_url: string;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string;
  cover_prompt?: string;
  author_name?: string;
  platforms: string;
  scheduled_at: string;
}

interface BlogEditorProps {
  postForm: BlogPostFormState;
  setPostForm: React.Dispatch<React.SetStateAction<BlogPostFormState>>;
  onSave: () => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

const GAME_TAG_OPTIONS = [
  { id: 'blitz', label: 'КвИИз (Блиц)', defaultCover: DIRECT_MEDIA_URLS.GAME_BLITZ },
  { id: 'millionaire', label: 'Квиллионер (Миллионер)', defaultCover: DIRECT_MEDIA_URLS.GAME_MILLIONAIRE },
  { id: '100to1', label: 'Сто Квадному (100 к 1)', defaultCover: DIRECT_MEDIA_URLS.GAME_100TO1 },
  { id: 'whatwherewhen', label: 'Что? Где? Квада? (ЧГК)', defaultCover: DIRECT_MEDIA_URLS.GAME_WHATWHEREWHEN },
  { id: 'jeopardy', label: 'Своя Икра (SI Game)', defaultCover: DIRECT_MEDIA_URLS.GAME_JEOPARDY },
  { id: 'general', label: 'Платформа / Общее', defaultCover: DIRECT_MEDIA_URLS.GAME_BLITZ }
];

export const BlogEditor: React.FC<BlogEditorProps> = ({
  postForm,
  setPostForm,
  onSave,
  onCancel,
  isEditing = false
}) => {
  const [activeMode, setActiveMode] = useState<'write' | 'preview' | 'split'>('split');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState('');
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [generatingCoverPrompt, setGeneratingCoverPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadService = new FileUploadService();

  const insertMarkdown = (before: string, after: string = '', defaultText: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = postForm.content || '';
    const selected = currentText.substring(start, end) || defaultText;

    const replacement = `${before}${selected}${after}`;
    const newContent = currentText.substring(0, start) + replacement + currentText.substring(end);

    setPostForm(prev => ({ ...prev, content: newContent }));

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selected.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  const handleUploadImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setImageUploadProgress('Загрузка изображения на сервер...');
      const uploadedResult: any = await uploadService.uploadFromFile(file);
      const uploadedUrl = typeof uploadedResult === 'string' ? uploadedResult : uploadedResult?.url;

      if (uploadedUrl) {
        if (!postForm.image_url) {
          setPostForm(prev => ({ ...prev, image_url: uploadedUrl }));
        }
        insertMarkdown(`\n![${file.name.replace(/\.[^/.]+$/, '')}](${uploadedUrl})\n`, '', '');
        setImageUploadProgress('Изображение успешно загружено!');
        setTimeout(() => setImageUploadProgress(null), 3000);
      }
    } catch (err: any) {
      setAiStatusMessage(`Ошибка загрузки изображения: ${err?.message || 'неизвестная ошибка'}`);
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 1. Generate or expand full 8000+ character SEO article via ProTalk AI
  const handleGenerateFullArticleWithAI = async () => {
    if (!postForm.title.trim()) {
      setAiStatusMessage('Сначала укажите заголовок публикации для генерации статьи.');
      return;
    }
    setGeneratingArticle(true);
    setAiStatusMessage('ИИ ProTalk пишет развёрнутую SEO-статью (8000+ символов)... Пожалуйста, подождите 30–60 секунд.');
    try {
      const generatedText = await protalkService.generateBlogArticleWithAI({
        title: postForm.title.trim(),
        description: (postForm.excerpt || postForm.content || postForm.title).trim(),
        game_id: postForm.game_id || 'blitz',
        seo_keywords: postForm.seo_keywords || '',
        note: aiNote.trim()
      });

      if (generatedText && generatedText.trim().length > 100) {
        setPostForm(prev => ({
          ...prev,
          content: generatedText.trim(),
          excerpt: prev.excerpt?.trim()
            ? prev.excerpt
            : generatedText
                .replace(/[#*>`-]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 260) + '...'
        }));
        setAiStatusMessage(`Статья успешно сгенерирована (${generatedText.trim().length} символов)!`);
      } else {
        setAiStatusMessage('Нейросеть вернула слишком короткий ответ. Попробуйте уточнить примечание.');
      }
    } catch (err: any) {
      setAiStatusMessage(`Ошибка генерации статьи: ${err?.message || 'Попробуйте ещё раз'}`);
    } finally {
      setGeneratingArticle(false);
    }
  };

  // 2. Generate SEO metadata (Title, Description, Keywords, Excerpt, Slug) via ProTalk AI
  const handleGenerateSeoWithAI = async () => {
    if (!postForm.title.trim()) {
      setAiStatusMessage('Сначала введите заголовок статьи для генерации SEO-метаданных.');
      return;
    }
    setGeneratingSeo(true);
    setAiStatusMessage('ИИ ProTalk подбирает SEO-ключи, заголовок, мета-описание и ЧПУ-ссылку...');
    try {
      const seoData = await protalkService.generateBlogSEO({
        title: postForm.title.trim(),
        description: (postForm.excerpt || postForm.content.slice(0, 1000) || postForm.title).trim(),
        game_id: postForm.game_id || 'blitz',
        note: aiNote.trim()
      });

      setPostForm(prev => ({
        ...prev,
        seo_title: seoData.seo_title || prev.seo_title || prev.title,
        seo_description: seoData.seo_description || prev.seo_description || prev.excerpt,
        seo_keywords: seoData.seo_keywords || prev.seo_keywords,
        excerpt: seoData.excerpt || prev.excerpt,
        slug: seoData.slug || prev.slug
      }));
      setAiStatusMessage('SEO-метаданные и ключевые запросы успешно сформированы!');
    } catch (err: any) {
      setAiStatusMessage(`Ошибка генерации SEO: ${err?.message || 'Попробуйте ещё раз'}`);
    } finally {
      setGeneratingSeo(false);
    }
  };

  // 3. Generate Cover Image Prompt via ProTalk AI
  const handleGenerateCoverPromptWithAI = async () => {
    if (!postForm.title.trim()) {
      setAiStatusMessage('Сначала укажите заголовок статьи для создания промпта обложки.');
      return;
    }
    setGeneratingCoverPrompt(true);
    setAiStatusMessage('ИИ ProTalk составляет промпт для генерации обложки статьи...');
    try {
      const promptText = await protalkService.generateBlogCoverPrompt({
        title: postForm.title.trim(),
        description: (postForm.excerpt || postForm.content.slice(0, 600) || postForm.title).trim(),
        game_id: postForm.game_id || 'blitz',
        note: aiNote.trim()
      });

      if (promptText) {
        setPostForm(prev => ({ ...prev, cover_prompt: promptText.trim() }));
        setAiStatusMessage('Промпт для генерации обложки готов! Вы можете скопировать его или отредактировать.');
      }
    } catch (err: any) {
      setAiStatusMessage(`Ошибка генерации промпта обложки: ${err?.message || 'Попробуйте ещё раз'}`);
    } finally {
      setGeneratingCoverPrompt(false);
    }
  };

  const handleCopyCoverPrompt = () => {
    if (!postForm.cover_prompt) return;
    navigator.clipboard.writeText(postForm.cover_prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  return (
    <div className="space-y-5">
      <div className="p-5 sm:p-6 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl space-y-5 shadow-2xl">
        {/* Header & Mode Switcher */}
        <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-primary/20">
          <div className="flex items-center gap-3">
            <BubbleElement isBadge active size="md" icon={<FileText size={18} />}>
              {isEditing ? 'Редактирование статьи' : 'Новая SEO-статья в блог'}
            </BubbleElement>
            <span className="text-sm text-foreground/70">
              ИИ-редактор ProTalk (8000+ символов) + SEO-оптимизация
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <BubbleElement
              as="button"
              type="button"
              active={activeMode === 'write'}
              size="sm"
              onClick={() => setActiveMode('write')}
              icon={<Edit3 size={14} />}
            >
              Редактор
            </BubbleElement>
            <BubbleElement
              as="button"
              type="button"
              active={activeMode === 'split'}
              size="sm"
              onClick={() => setActiveMode('split')}
              icon={<FileText size={14} />}
              className="hidden sm:inline-flex"
            >
              Сплит
            </BubbleElement>
            <BubbleElement
              as="button"
              type="button"
              active={activeMode === 'preview'}
              size="sm"
              onClick={() => setActiveMode('preview')}
              icon={<Eye size={14} />}
            >
              Превью
            </BubbleElement>
          </div>
        </div>

        {/* Game Category Selector */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-primary block">
            Привязка статьи к игре (для перелинковки и SEO)
          </label>
          <div className="flex flex-wrap gap-2">
            {GAME_TAG_OPTIONS.map(g => (
              <BubbleElement
                key={g.id}
                as="button"
                type="button"
                active={(postForm.game_id || 'blitz') === g.id}
                size="sm"
                onClick={() =>
                  setPostForm(prev => ({
                    ...prev,
                    game_id: g.id,
                    image_url: prev.image_url || g.defaultCover
                  }))
                }
              >
                {g.label}
              </BubbleElement>
            ))}
          </div>
        </div>

        {/* Title & Slug */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">Заголовок статьи (H1)</label>
            <input
              type="text"
              value={postForm.title}
              onChange={e => setPostForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Введите заголовок статьи без капслока..."
              className="w-full p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-base font-bold text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-bold text-foreground/85 block">ЧПУ-ссылка (slug)</label>
            <input
              type="text"
              value={postForm.slug || ''}
              onChange={e => setPostForm(prev => ({ ...prev, slug: e.target.value }))}
              placeholder="avto-generaciya-iz-zagolovka"
              className="w-full p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Excerpt / Brief Description */}
        <div className="space-y-1.5">
          <label className="text-sm font-bold text-foreground/85 block">
            Краткое описание (анонс статьи / тезисы для ИИ-генератора)
          </label>
          <textarea
            rows={2}
            value={postForm.excerpt || ''}
            onChange={e => setPostForm(prev => ({ ...prev, excerpt: e.target.value }))}
            placeholder="Краткий анонс статьи (2–3 предложения). На его основе ИИ может развернуть лонгрид на 8000+ символов..."
            className="w-full p-3.5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-all resize-y"
          />
        </div>

        {/* AI ProTalk Assistant Panel */}
        <div className="rounded-3xl border border-primary/35 bg-transparent backdrop-blur-2xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary shrink-0" />
              <span className="text-sm font-black text-primary">
                ИИ-студия ProTalk: генерация лонгрида (8000+ знаков), SEO и обложки
              </span>
            </div>
            <BubbleElement isBadge size="sm">
              Длина текста: {(postForm.content || '').length} симв.
            </BubbleElement>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground/80 block">
              Примечание для ИИ (можно надиктовать голосом или написать текстом)
            </label>
            <MiniAudioField
              value={aiNote}
              onChange={setAiNote}
              placeholder="Например: сделай акцент на сравнении с SI Game Владимира Хиля, добавь больше примеров вопросов и FAQ..."
              multiline
              rows={2}
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <LeafButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleGenerateFullArticleWithAI}
              disabled={generatingArticle}
              icon={generatingArticle ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            >
              {generatingArticle ? 'Генерация статьи 8000+ симв...' : 'Сгенерировать статью 8000+ симв. с ИИ'}
            </LeafButton>

            <LeafButton
              type="button"
              variant="glass"
              size="sm"
              onClick={handleGenerateSeoWithAI}
              disabled={generatingSeo}
              icon={generatingSeo ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            >
              {generatingSeo ? 'Подбор SEO...' : 'Сгенерировать SEO-ключи и метатеги'}
            </LeafButton>

            <LeafButton
              type="button"
              variant="glass"
              size="sm"
              onClick={handleGenerateCoverPromptWithAI}
              disabled={generatingCoverPrompt}
              icon={generatingCoverPrompt ? <Loader2 size={16} className="animate-spin" /> : <Palette size={16} />}
            >
              {generatingCoverPrompt ? 'Создание промпта...' : 'Сгенерировать промпт обложки'}
            </LeafButton>
          </div>

          {aiStatusMessage && (
            <div className="rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl px-4 py-2.5 text-sm text-primary font-semibold flex items-center justify-between gap-2">
              <span>{aiStatusMessage}</span>
              <BubbleElement
                as="button"
                type="button"
                size="sm"
                onClick={() => setAiStatusMessage(null)}
              >
                Скрыть
              </BubbleElement>
            </div>
          )}
        </div>

        {/* Cover Image & Cover Prompt */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-sm font-bold text-foreground/85">Обложка статьи (URL или загрузка)</label>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadImageFile}
                />
                <LeafButton
                  type="button"
                  variant="glass"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  icon={uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                >
                  Загрузить файл
                </LeafButton>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={postForm.image_url}
                onChange={e => setPostForm(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://file.pro-talk.ru/..."
                className="flex-1 p-3 rounded-2xl bg-transparent backdrop-blur-md border border-primary/30 text-sm font-mono text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary"
              />
              {postForm.image_url && (
                <BubbleElement
                  as="button"
                  type="button"
                  size="sm"
                  onClick={() => setPostForm(prev => ({ ...prev, image_url: '' }))}
                  title="Очистить обложку"
                >
                  <Trash2 size={15} className="text-rose-400" />
                </BubbleElement>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {GAME_TAG_OPTIONS.slice(0, 5).map(g => (
                <BubbleElement
                  key={`cover-preset-${g.id}`}
                  as="button"
                  type="button"
                  size="sm"
                  active={postForm.image_url === g.defaultCover}
                  onClick={() => setPostForm(prev => ({ ...prev, image_url: g.defaultCover }))}
                >
                  Обложка: {g.label.split(' ')[0]}
                </BubbleElement>
              ))}
            </div>

            {imageUploadProgress && (
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Check size={15} />
                <span>{imageUploadProgress}</span>
              </div>
            )}

            {postForm.image_url && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-sm text-foreground/70">
                  <span>Предпросмотр обложки поста</span>
                  <span className="text-primary font-bold">Формат 16:9</span>
                </div>
                <div className="relative rounded-2xl overflow-hidden border border-primary/30 aspect-video w-full bg-transparent backdrop-blur-xl shadow-lg">
                  <img
                    src={postForm.image_url}
                    alt="Предпросмотр обложки"
                    className="w-full h-full object-cover object-center"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Ready-made Prompt for Cover Image Generation */}
          <div className="space-y-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-sm font-bold text-primary">
                  Готовый промпт для генерации обложки (Midjourney / Flux / DALL-E)
                </label>
                {postForm.cover_prompt && (
                  <BubbleElement
                    as="button"
                    type="button"
                    size="sm"
                    onClick={handleCopyCoverPrompt}
                    icon={copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
                  >
                    {copiedPrompt ? 'Скопировано' : 'Копировать промпт'}
                  </BubbleElement>
                )}
              </div>
              <textarea
                rows={5}
                value={postForm.cover_prompt || ''}
                onChange={e => setPostForm(prev => ({ ...prev, cover_prompt: e.target.value }))}
                placeholder="Нажмите «Сгенерировать промпт обложки» выше или впишите промпт для нейросети..."
                className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-md border border-primary/30 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary resize-y"
              />
            </div>
            <p className="text-sm text-foreground/60">
              Стиль обложек: глубокий графитовый холст, жидкое стекло Liquid Glass Apple и лаймовые акценты #99d037.
            </p>
          </div>
        </div>

        {/* SEO Fields Block */}
        <div className="rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-bold text-primary">
              SEO-настройки статьи (Яндекс, Google, ИИ-поисковики)
            </span>
            <span className="text-sm text-foreground/60">
              Используются в мета-тегах и микроразметке Schema.org Article
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-semibold text-foreground/80">SEO Title (заголовок в поиске)</label>
              <input
                type="text"
                value={postForm.seo_title || ''}
                onChange={e => setPostForm(prev => ({ ...prev, seo_title: e.target.value }))}
                placeholder="SEO-заголовок до 65 символов..."
                className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-md border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-foreground/80">Автор статьи</label>
              <input
                type="text"
                value={postForm.author_name || 'Редакция КвИИз'}
                onChange={e => setPostForm(prev => ({ ...prev, author_name: e.target.value }))}
                placeholder="Редакция КвИИз"
                className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-md border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-foreground/80">SEO Description (мета-описание)</label>
            <textarea
              rows={2}
              value={postForm.seo_description || ''}
              onChange={e => setPostForm(prev => ({ ...prev, seo_description: e.target.value }))}
              placeholder="Кликабельное описание для сниппета в поисковой выдаче (150–160 символов)..."
              className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-md border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary resize-y"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold text-foreground/80">
              Ключевые запросы (SEO Keywords через запятую)
            </label>
            <textarea
              rows={2}
              value={postForm.seo_keywords || ''}
              onChange={e => setPostForm(prev => ({ ...prev, seo_keywords: e.target.value }))}
              placeholder="своя игра онлайн, si game, владимир хиль, квиллионер, кто хочет стать миллионером, 100 к 1, что где когда..."
              className="w-full p-3 rounded-2xl bg-transparent backdrop-blur-md border border-primary/25 text-sm text-foreground focus:outline-none focus:border-primary resize-y"
            />
          </div>
        </div>

        {/* Markdown Formatting Toolbar */}
        <div className="flex items-center gap-1.5 p-2 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/25 flex-wrap">
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('**', '**', 'жирный текст')}
            title="Жирный шрифт"
          >
            <Bold size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('*', '*', 'курсив')}
            title="Курсив"
          >
            <Italic size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('# ', '', 'Заголовок 1')}
            title="Заголовок 1"
          >
            <Heading1 size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('## ', '', 'Заголовок 2')}
            title="Заголовок 2"
          >
            <Heading2 size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('### ', '', 'Заголовок 3')}
            title="Заголовок 3"
          >
            <Heading3 size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('- ', '', 'Элемент списка')}
            title="Маркированный список"
          >
            <List size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('1. ', '', 'Нумерованный элемент')}
            title="Нумерованный список"
          >
            <ListOrdered size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('> ', '', 'Цитата')}
            title="Цитата"
          >
            <span className="font-serif font-bold text-sm">“ ”</span>
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => insertMarkdown('[', '](https://example.com)', 'текст ссылки')}
            title="Вставить ссылку"
          >
            <Link2 size={15} />
          </BubbleElement>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Вставить картинку"
          >
            <ImageIcon size={15} />
          </BubbleElement>
        </div>

        {/* Content Body Editor & Preview */}
        <div className={`grid gap-4 ${activeMode === 'split' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {(activeMode === 'write' || activeMode === 'split') && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground/75 flex items-center justify-between">
                <span>Текст статьи (Markdown)</span>
                <span className="text-primary font-bold">{(postForm.content || '').length} символов</span>
              </label>
              <textarea
                ref={textareaRef}
                value={postForm.content}
                onChange={e => setPostForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Пишите статью, используя Markdown разметку, или нажмите кнопку «Сгенерировать статью 8000+ симв. с ИИ»..."
                className="w-full min-h-[420px] max-h-[700px] p-4 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 text-sm font-mono text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-primary transition-all resize-y custom-scrollbar"
              />
            </div>
          )}

          {(activeMode === 'preview' || activeMode === 'split') && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-foreground/75 flex items-center justify-between">
                <span>Живое превью статьи (с оформленным UI)</span>
                <span className="text-primary font-bold">Как в блоге</span>
              </label>
              <div className="min-h-[420px] max-h-[700px] p-5 rounded-2xl bg-transparent backdrop-blur-xl border border-primary/30 overflow-y-auto custom-scrollbar space-y-5">
                {postForm.image_url && (
                  <div className="relative rounded-2xl overflow-hidden border border-primary/30 aspect-video w-full">
                    <img
                      src={postForm.image_url}
                      alt={postForm.title || 'Обложка'}
                      className="w-full h-full object-cover object-center"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                {postForm.title && (
                  <h1 className="text-2xl sm:text-3xl font-black text-primary pb-3 border-b border-primary/25 leading-tight drop-shadow-[0_0_12px_rgba(182,255,46,0.2)]">
                    {postForm.title}
                  </h1>
                )}
                {postForm.excerpt && (
                  <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-4 text-sm sm:text-base font-medium text-foreground/95 leading-relaxed flex items-start gap-2.5">
                    <Sparkles size={16} className="text-primary shrink-0 mt-1" />
                    <span>{postForm.excerpt}</span>
                  </div>
                )}
                {postForm.content ? (
                  <BlogArticleContent content={postForm.content} />
                ) : (
                  <p className="text-sm text-foreground/50 italic">
                    Здесь отобразится отформатированный текст вашей статьи с выделением заголовков, списков, жирного текста и иконок...
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-primary/20 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <BubbleElement isBadge size="sm">
              Платформа: {postForm.platforms || 'Блог + Поисковики'}
            </BubbleElement>
            <BubbleElement isBadge active={(postForm.content || '').length >= 7500} size="sm">
              Объём: {(postForm.content || '').length} знаков
            </BubbleElement>
          </div>

          <div className="flex items-center gap-3">
            {onCancel && isEditing && (
              <LeafButton type="button" variant="glass" size="md" onClick={onCancel}>
                Отмена
              </LeafButton>
            )}
            <LeafButton
              type="button"
              variant="primary"
              size="md"
              onClick={onSave}
              disabled={!postForm.title.trim() || !postForm.content.trim()}
              icon={<Send size={16} />}
            >
              {isEditing ? 'Сохранить изменения' : 'Опубликовать статью'}
            </LeafButton>
          </div>
        </div>
      </div>
    </div>
  );
};
