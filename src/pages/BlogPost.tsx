import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import {
  ArrowLeft,
  Calendar,
  User,
  Share2,
  Play,
  BookOpen,
  Sparkles,
  Copy,
  Check,
  Loader2,
  Clock,
  Tag
} from 'lucide-react';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { BlogArticleContent } from '../components/BlogArticleContent';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';

const GAME_META: Record<string, { title: string; route: string; badge: string }> = {
  blitz: { title: 'КвИИз', route: '/?start_game=blitz', badge: 'Скоростной ИИ-спринт' },
  millionaire: { title: 'Квиллионер', route: '/?start_game=millionaire', badge: '15 шагов к вершине' },
  '100to1': { title: 'Сто Квадному', route: '/?start_game=100to1', badge: 'Народный опрос 100 к 1' },
  whatwherewhen: { title: 'Что? Где? Квада?', route: '/?start_game=whatwherewhen', badge: 'Элитарный клуб знатоков' },
  jeopardy: { title: 'Своя Икра', route: '/?start_game=jeopardy', badge: 'Аналог Своей Игры и SI Game' }
};

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<any | null>(null);
  const [relatedPosts, setRelatedPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!slug) return;

    const loadPost = async () => {
      setLoading(true);
      try {
        const [postRes, allRes] = await Promise.all([
          fetch(`/api/posts/${encodeURIComponent(slug)}`).then(r => r.json()).catch(() => null),
          fetch('/api/posts').then(r => r.json()).catch(() => null)
        ]);

        const loadedPost = postRes?.data || null;
        setPost(loadedPost);

        if (Array.isArray(allRes?.data)) {
          setRelatedPosts(
            allRes.data.filter((p: any) => p.slug !== slug && p.id !== slug).slice(0, 4)
          );
        }
      } catch (err) {
        console.error('Error loading blog post:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [slug]);

  // Dynamically inject SEO title, meta description, keywords, OpenGraph & JSON-LD structured data
  useEffect(() => {
    if (!post) return;

    const prevTitle = document.title;
    const seoTitle = post.seo_title || `${post.title} — Блог КвИИз`;
    const seoDesc =
      post.seo_description ||
      post.excerpt ||
      (post.content || '').replace(/[#*>`-]/g, '').slice(0, 160);
    const seoKeywords = post.seo_keywords || '';

    document.title = seoTitle;

    const setMetaTag = (selector: string, attrName: string, attrVal: string, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMetaTag('meta[name="description"]', 'name', 'description', seoDesc);
    if (seoKeywords) {
      setMetaTag('meta[name="keywords"]', 'name', 'keywords', seoKeywords);
    }
    setMetaTag('meta[property="og:title"]', 'property', 'og:title', seoTitle);
    setMetaTag('meta[property="og:description"]', 'property', 'og:description', seoDesc);
    setMetaTag('meta[property="og:type"]', 'property', 'og:type', 'article');
    if (post.image_url) {
      const fullImg = post.image_url.startsWith('http')
        ? post.image_url
        : `${window.location.origin}${post.image_url}`;
      setMetaTag('meta[property="og:image"]', 'property', 'og:image', fullImg);
    }

    // Inject Article JSON-LD
    const scriptId = 'qaiz-blogpost-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: seoDesc,
      keywords: seoKeywords,
      image: post.image_url
        ? post.image_url.startsWith('http')
          ? post.image_url
          : `${window.location.origin}${post.image_url}`
        : DIRECT_MEDIA_URLS.SOCIAL_COVER,
      author: {
        '@type': 'Organization',
        name: post.author_name || 'Редакция КвИИз'
      },
      publisher: {
        '@type': 'Organization',
        name: 'КвИИз (Qaiz)',
        logo: {
          '@type': 'ImageObject',
          url: DIRECT_MEDIA_URLS.HERO_LOGO
        }
      },
      datePublished: post.created_at || new Date().toISOString(),
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': window.location.href
      }
    };

    scriptEl.textContent = JSON.stringify(articleSchema);

    return () => {
      document.title = prevTitle;
      setMetaTag('meta[property="og:image"]', 'property', 'og:image', DIRECT_MEDIA_URLS.SOCIAL_COVER);
      setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', DIRECT_MEDIA_URLS.SOCIAL_COVER);
      const existingScript = document.getElementById(scriptId);
      if (existingScript) existingScript.remove();
    };
  }, [post]);

  const handleShare = () => {
    const shareUrl = window.location.href;
    if (navigator.share && post) {
      navigator
        .share({
          title: post.title,
          text: post.excerpt || post.seo_description || post.title,
          url: shareUrl
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleCopyPrompt = () => {
    if (!post?.cover_prompt) return;
    navigator.clipboard.writeText(post.cover_prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-36 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-base font-medium text-foreground/80">Загрузка статьи...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center space-y-5">
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 space-y-4">
          <BookOpen className="mx-auto text-primary" size={44} />
          <h1 className="text-2xl font-bold text-foreground">Статья не найдена</h1>
          <p className="text-sm text-foreground/70">
            Возможно, публикация была перемещена или вы перешли по устаревшей ссылке.
          </p>
          <div className="flex justify-center pt-2">
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate('/blog')}
              icon={<ArrowLeft size={16} />}
            >
              Вернуться в блог
            </LeafButton>
          </div>
        </div>
      </div>
    );
  }

  const gameMeta = GAME_META[post.game_id] || GAME_META.blitz;
  const charCount = (post.content || '').length;
  const readingMinutes = Math.max(4, Math.ceil(charCount / 1100));
  const keywordsList = (post.seo_keywords || '')
    .split(',')
    .map((k: string) => k.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-4xl px-2 sm:px-4 py-4 pb-24 space-y-8">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <LeafButton
          variant="glass"
          size="sm"
          onClick={() => navigate('/blog')}
          icon={<ArrowLeft size={16} />}
        >
          Все статьи блога
        </LeafButton>

        <div className="flex items-center gap-2 flex-wrap">
          <LeafButton
            variant="primary"
            size="sm"
            onClick={() => navigate(gameMeta.route)}
            icon={<Play size={15} />}
          >
            Играть в «{gameMeta.title}»
          </LeafButton>
          <BubbleElement
            as="button"
            type="button"
            size="sm"
            onClick={handleShare}
            icon={copiedLink ? <Check size={14} /> : <Share2 size={14} />}
          >
            {copiedLink ? 'Ссылка скопирована' : 'Поделиться'}
          </BubbleElement>
        </div>
      </div>

      {/* Main Article Card */}
      <article className="overflow-hidden rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl">
        {/* Hero Cover Image */}
        {post.image_url && (
          <div className="relative w-full h-64 sm:h-96 overflow-hidden border-b border-primary/25">
            <img
              src={post.image_url}
              alt={post.title}
              className="w-full h-full object-cover object-center"
              referrerPolicy="no-referrer"
            />
            <div className="absolute top-4 left-4 flex flex-wrap gap-2">
              <BubbleElement isBadge active size="sm" icon={<Sparkles size={14} />}>
                {gameMeta.title} • {gameMeta.badge}
              </BubbleElement>
            </div>
          </div>
        )}

        <div className="p-5 sm:p-8 md:p-10 space-y-6">
          {/* Article Meta Info */}
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-foreground/75">
            <BubbleElement isBadge size="sm" icon={<Calendar size={14} />}>
              {new Date(post.created_at || Date.now()).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
              })}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<User size={14} />}>
              {post.author_name || 'Редакция КвИИз'}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<Clock size={14} />}>
              Время чтения: ~{readingMinutes} мин ({charCount} знаков)
            </BubbleElement>
          </div>

          {/* H1 Title */}
          <h1 className="text-2xl sm:text-4xl font-black text-primary leading-tight tracking-tight drop-shadow-[0_0_14px_rgba(182,255,46,0.2)]">
            {post.title}
          </h1>

          {/* Excerpt Highlight Box */}
          {post.excerpt && (
            <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-4 sm:p-5 text-base font-medium text-foreground/95 leading-relaxed flex items-start gap-3">
              <Sparkles size={18} className="text-primary shrink-0 mt-1" />
              <span>{post.excerpt}</span>
            </div>
          )}

          {/* Quick Game Launch Banner */}
          <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-base font-black text-primary">
                Хотите опробовать игру «{gameMeta.title}» на практике?
              </div>
              <p className="text-sm text-foreground/80">
                Выберите любую тему, добавьте голосовое или текстовое примечание для ИИ и начните партию!
              </p>
            </div>
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate(gameMeta.route)}
              icon={<Play size={16} />}
              className="shrink-0 justify-center"
            >
              Запустить «{gameMeta.title}»
            </LeafButton>
          </div>

          {/* Markdown Article Body */}
          <BlogArticleContent content={post.content} />

          {/* SEO Keywords Cloud */}
          {keywordsList.length > 0 && (
            <div className="pt-4 border-t border-primary/20 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground/75">
                <Tag size={15} className="text-primary" />
                <span>Ключевые темы и поисковые теги статьи:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keywordsList.map((kw: string, idx: number) => (
                  <BubbleElement key={`kw-${idx}`} isBadge size="sm">
                    {kw}
                  </BubbleElement>
                ))}
              </div>
            </div>
          )}

          {/* Bottom CTA */}
          <div className="pt-4 border-t border-primary/20 flex flex-wrap items-center justify-between gap-3">
            <LeafButton
              variant="glass"
              size="md"
              onClick={() => navigate('/blog')}
              icon={<ArrowLeft size={16} />}
            >
              Ко всем статьям
            </LeafButton>
            <LeafButton
              variant="primary"
              size="md"
              onClick={() => navigate(gameMeta.route)}
              icon={<Play size={16} />}
            >
              Играть в «{gameMeta.title}»
            </LeafButton>
          </div>
        </div>
      </article>

      {/* Related Articles */}
      {relatedPosts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-black text-foreground">
            Другие обзоры игр и гайды платформы
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedPosts.map((rel, idx) => {
              const relGame = GAME_META[rel.game_id] || GAME_META.blitz;
              return (
                <Link
                  key={rel.id || idx}
                  to={`/blog/${rel.slug || rel.id}`}
                  className="no-underline group rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl overflow-hidden hover:border-primary/60 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    {rel.image_url && (
                      <div className="h-44 w-full overflow-hidden border-b border-primary/20">
                        <img
                          src={rel.image_url}
                          alt={rel.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="p-5 space-y-2">
                      <BubbleElement isBadge active size="sm">
                        {relGame.title}
                      </BubbleElement>
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {rel.title}
                      </h3>
                      <p className="text-sm text-foreground/75 line-clamp-3">
                        {rel.excerpt || rel.seo_description}
                      </p>
                    </div>
                  </div>
                  <div className="px-5 pb-5 pt-2 flex items-center justify-between text-sm font-bold text-primary">
                    <span>Читать обзор полностью</span>
                    <span>→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
