import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Calendar,
  User,
  Share2,
  Play,
  BookOpen,
  Sparkles,
  Check,
  Loader2,
  Clock,
  Tag,
  ExternalLink,
} from 'lucide-react';
import { LeafButton } from '../components/ui/LeafButton';
import { BubbleElement } from '../components/ui/BubbleElement';
import { BlogArticleContent } from '../components/BlogArticleContent';
import { TgButtonsBlock } from '../components/blog/TgButtonsBlock';
import { TgGalleryBlock } from '../components/blog/TgGalleryBlock';
import { BlogMascotLoader } from '../components/blog/loaders/BlogMascotLoader';
import { SiteFooter } from '../components/layout/SiteFooter';
import {
  TgButtonItem,
  sanitizeBlogUrl,
  isVideoMediaUrl,
  normalizeDisplayCaps,
  resolveArticleFallbackMedia,
} from '../components/blog/urlSafety';
import { DIRECT_MEDIA_URLS } from '../shared/mediaUrls';
import {
  getCachedBlogPost,
  getCachedRelatedPosts,
  hasSavedBlogPosition,
  markBlogRestorePending,
  seedPostsIntoCache,
} from '../services/blog/blogCache';

const GAME_META: Record<string, { title: string; route: string; badge: string }> = {
  blitz: { title: 'КвИИз', route: '/?start_game=blitz', badge: 'Скоростной ИИ-спринт' },
  millionaire: { title: 'Квиллионер', route: '/?start_game=millionaire', badge: '15 шагов к вершине' },
  '100to1': { title: 'Сто Квадному', route: '/?start_game=100to1', badge: 'Народный опрос 100 к 1' },
  whatwherewhen: { title: 'Что? Где? Квада?', route: '/?start_game=whatwherewhen', badge: 'Элитарный клуб знатоков' },
  jeopardy: { title: 'Своя Икра', route: '/?start_game=jeopardy', badge: 'Аналог Своей Игры и SI Game' },
};

function resolveAbsoluteImageUrl(rawUrl?: string | null): string {
  const safe = sanitizeBlogUrl(rawUrl);
  if (!safe || isVideoMediaUrl(safe)) {
    return DIRECT_MEDIA_URLS.SOCIAL_COVER;
  }
  return safe.startsWith('http') ? safe : `${window.location.origin}${safe}`;
}

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const initialCached = slug ? getCachedBlogPost(slug)?.post || null : null;
  const [post, setPost] = useState<any | null>(() => initialCached);
  const [relatedPosts, setRelatedPosts] = useState<any[]>(() =>
    slug ? getCachedRelatedPosts(slug, 4) : []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleBackToBlog = () => {
    if (hasSavedBlogPosition()) {
      markBlogRestorePending(true);
    }
    navigate('/blog');
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    if (!slug) return;

    let cancelled = false;
    const cachedEntry = getCachedBlogPost(slug);
    const cachedRelated = getCachedRelatedPosts(slug, 4);

    if (cachedEntry?.post) {
      setPost(cachedEntry.post);
      setLoading(false);
    } else {
      setPost(null);
      setLoading(true);
    }
    if (cachedRelated.length > 0) {
      setRelatedPosts(cachedRelated);
    }

    const loadPost = async () => {
      try {
        const shouldFetchRelated = cachedRelated.length === 0;
        const [postRes, relatedRes] = await Promise.all([
          fetch(`/api/posts/${encodeURIComponent(slug)}`).then((r) => r.json()).catch(() => null),
          shouldFetchRelated
            ? fetch('/api/posts?limit=6&offset=0').then((r) => r.json()).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const loadedPost = postRes?.data || null;
        if (loadedPost) {
          setPost(loadedPost);
          seedPostsIntoCache([loadedPost]);
        } else if (!cachedEntry?.post) {
          setPost(null);
        }

        if (Array.isArray(relatedRes?.data)) {
          seedPostsIntoCache(relatedRes.data);
          setRelatedPosts(
            relatedRes.data.filter((p: any) => p.slug !== slug && p.id !== slug).slice(0, 4)
          );
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading blog post:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadPost();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Dynamically inject SEO title, meta description, keywords, OpenGraph & TechArticle JSON-LD
  useEffect(() => {
    if (!post) return;

    const prevTitle = document.title;
    const normalizedTitle = normalizeDisplayCaps(post.title);
    const seoTitle = normalizeDisplayCaps(post.seo_title) || `${normalizedTitle} — Блог КвИИз`;
    const seoDesc =
      normalizeDisplayCaps(post.seo_description || post.excerpt) ||
      (post.content || '').replace(/[#*>`-]/g, '').slice(0, 160);
    const seoKeywords = post.seo_keywords || '';

    // Cover image ONLY (never video URL) for og:image, twitter:image, and JSON-LD TechArticle.image
    const seoImageUrl = resolveAbsoluteImageUrl(post.cover_image_url || post.image_url);

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
    setMetaTag('meta[property="og:image"]', 'property', 'og:image', seoImageUrl);
    setMetaTag('meta[name="twitter:image"]', 'name', 'twitter:image', seoImageUrl);

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
      '@type': 'TechArticle',
      headline: normalizedTitle,
      description: seoDesc,
      keywords: seoKeywords,
      articleSection: post.category || GAME_META[post.game_id]?.title || 'Блог',
      image: seoImageUrl,
      author: {
        '@type': 'Organization',
        name: post.author_name || 'Редакция КвИИз',
      },
      publisher: {
        '@type': 'Organization',
        name: 'КвИИз (Qaiz)',
        logo: {
          '@type': 'ImageObject',
          url: DIRECT_MEDIA_URLS.HERO_LOGO,
        },
      },
      datePublished: post.published_at || post.created_at || new Date().toISOString(),
      dateModified: post.updated_at || post.published_at || post.created_at || new Date().toISOString(),
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': window.location.href,
      },
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

  const parsedButtons = useMemo<TgButtonItem[][]>(() => {
    if (!post?.buttons_json) return [];
    if (String(post.content || '').includes('```tg-buttons')) {
      return [];
    }
    try {
      const parsed = JSON.parse(post.buttons_json);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [post]);

  const fallbackHeroMedia = useMemo(() => resolveArticleFallbackMedia(post), [post]);

  const handleShare = () => {
    const shareUrl = window.location.href;
    if (navigator.share && post) {
      const displayTitle = normalizeDisplayCaps(post.title);
      navigator
        .share({
          title: displayTitle,
          text: normalizeDisplayCaps(post.excerpt || post.seo_description || displayTitle),
          url: shareUrl,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  if (loading && !post) {
    return (
      <BlogMascotLoader
        title="Загрузка статьи..."
        subtitle="Открываем полную публикацию блога Квайз"
      />
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center space-y-5">
        <div className="rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl p-8 space-y-4">
          <BookOpen className="mx-auto text-primary" size={44} />
          <h1 className="text-2xl font-bold text-foreground">Статья не найдена</h1>
          <p className="text-sm text-foreground/75">
            Возможно, публикация была перемещена или вы перешли по устаревшей ссылке.
          </p>
          <div className="flex justify-center pt-2">
            <LeafButton
              variant="primary"
              size="md"
              onClick={handleBackToBlog}
              icon={<ArrowLeft size={16} />}
            >
              Вернуться в блог
            </LeafButton>
          </div>
        </div>
      </div>
    );
  }

  const isGamePost = Boolean(post.game_id && GAME_META[post.game_id]);
  const gameMeta = isGamePost ? GAME_META[post.game_id] : null;
  const displayTitle = normalizeDisplayCaps(post.title);
  const displayExcerpt = normalizeDisplayCaps(post.excerpt);
  const categoryLabel = gameMeta
    ? `${gameMeta.title} • ${gameMeta.badge}`
    : normalizeDisplayCaps(post.category || 'SAV AI • ИИ-публикация');
  const charCount = (post.content || '').length;
  const readingMinutes = Math.max(1, Number(post.reading_time) || Math.ceil(charCount / 1100));
  const keywordsList = (post.seo_keywords || '')
    .split(',')
    .map((k: string) => k.trim())
    .filter(Boolean);
  const telegramUrl = sanitizeBlogUrl(post.telegram_post_url || post.source_url);
  const formattedDate = new Date(post.published_at || post.created_at || Date.now()).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="mx-auto max-w-4xl px-2 sm:px-4 py-4 pb-24 space-y-8">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <LeafButton
          variant="glass"
          size="sm"
          onClick={handleBackToBlog}
          icon={<ArrowLeft size={16} />}
        >
          Все статьи блога
        </LeafButton>

        <div className="flex items-center gap-2 flex-wrap">
          {gameMeta ? (
            <LeafButton
              variant="primary"
              size="sm"
              onClick={() => navigate(gameMeta.route)}
              icon={<Play size={15} />}
            >
              Играть в «{gameMeta.title}»
            </LeafButton>
          ) : (
            telegramUrl && (
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="no-underline"
              >
                <BubbleElement as="div" active size="sm" icon={<ExternalLink size={14} />}>
                  Открыть в Telegram
                </BubbleElement>
              </a>
            )
          )}

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

      {/* Main Article Card (NO separate hero cover banner inside /blog/:slug to prevent media duplication) */}
      <motion.article
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="overflow-hidden rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-2xl"
      >
        <div className="p-5 sm:p-8 md:p-10 space-y-6 min-w-0">
          {/* Article Meta Info */}
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-foreground/80">
            <BubbleElement isBadge active size="sm" icon={<Sparkles size={14} />} className="max-w-full whitespace-normal">
              {categoryLabel}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<Calendar size={14} />}>
              {formattedDate}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<User size={14} />} className="max-w-full whitespace-normal">
              {post.author_name || 'Редакция КвИИз'}
              {post.author_role ? ` • ${post.author_role}` : ''}
            </BubbleElement>
            <BubbleElement isBadge size="sm" icon={<Clock size={14} />}>
              Время чтения: ~{readingMinutes} мин
            </BubbleElement>
          </div>

          {/* H1 Title */}
          <h1 className="text-2xl sm:text-4xl font-black text-primary leading-tight tracking-tight drop-shadow-[0_0_14px_rgba(182,255,46,0.2)] break-words">
            {displayTitle}
          </h1>

          {/* Excerpt Highlight Box (shown only when distinct summary exists) */}
          {displayExcerpt && (
            <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-4 sm:p-5 text-base font-medium text-foreground/95 leading-relaxed flex items-start gap-3">
              <Sparkles size={18} className="text-primary shrink-0 mt-1" />
              <span className="min-w-0 break-words">{displayExcerpt}</span>
            </div>
          )}

          {/* Quick Game Launch Banner strictly for internal KvaiZ game guide articles */}
          {gameMeta && (
            <div className="rounded-2xl border border-primary/35 bg-transparent backdrop-blur-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="text-base font-black text-primary break-words">
                  Хотите опробовать игру «{gameMeta.title}» на практике?
                </div>
                <p className="text-sm text-foreground/80 break-words">
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
          )}

          {/* Hero cover / single media when article markdown doesn't already embed media */}
          {fallbackHeroMedia.length > 0 && (
            <TgGalleryBlock
              items={fallbackHeroMedia}
              fallbackPostUrl={telegramUrl || undefined}
              eagerFirst
              defaultAlt={displayTitle}
            />
          )}

          {/* Markdown Article Body */}
          <BlogArticleContent
            content={post.content}
            telegramPostUrl={post.telegram_post_url || post.source_url}
          />

          {/* Post CTA Buttons from RSS buttons_json (if not already embedded inside markdown) */}
          {parsedButtons.length > 0 && <TgButtonsBlock rows={parsedButtons} />}

          {/* SEO Keywords Cloud */}
          {keywordsList.length > 0 && (
            <div className="pt-4 border-t border-primary/20 space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground/75">
                <Tag size={15} className="text-primary" />
                <span>Ключевые темы и теги публикации:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keywordsList.map((kw: string, idx: number) => (
                  <BubbleElement key={`kw-${idx}`} isBadge size="sm" className="max-w-full whitespace-normal">
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
              onClick={handleBackToBlog}
              icon={<ArrowLeft size={16} />}
            >
              Ко всем статьям
            </LeafButton>

            {gameMeta ? (
              <LeafButton
                variant="primary"
                size="md"
                onClick={() => navigate(gameMeta.route)}
                icon={<Play size={16} />}
              >
                Играть в «{gameMeta.title}»
              </LeafButton>
            ) : (
              <LeafButton
                variant="primary"
                size="md"
                onClick={() => navigate('/')}
                icon={<Play size={16} />}
              >
                Перейти к играм КвИИз
              </LeafButton>
            )}
          </div>
        </div>
      </motion.article>

      {/* Related Articles */}
      {relatedPosts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl sm:text-2xl font-black text-foreground">
            Другие публикации и гайды
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {relatedPosts.map((rel, idx) => {
              const relGame = rel.game_id ? GAME_META[rel.game_id] : null;
              const relBadge = relGame
                ? relGame.title
                : normalizeDisplayCaps(rel.category || 'SAV AI');
              const relVideo = sanitizeBlogUrl(rel.cover_video_url);
              const rawRelImg = sanitizeBlogUrl(rel.cover_image_url || rel.image_url);
              const relImg = rawRelImg && !isVideoMediaUrl(rawRelImg) ? rawRelImg : '';
              return (
                <Link
                  key={rel.id || idx}
                  to={`/blog/${rel.slug || rel.id}`}
                  className="no-underline group rounded-3xl border border-primary/25 bg-transparent backdrop-blur-2xl overflow-hidden hover:border-primary/60 transition-all flex flex-col justify-between shadow-lg"
                >
                  <div>
                    {relVideo ? (
                      <div className="h-44 w-full overflow-hidden border-b border-primary/20">
                        <video
                          src={relVideo}
                          autoPlay
                          muted
                          loop
                          playsInline
                          preload="auto"
                          className="w-full h-full object-cover block"
                        />
                      </div>
                    ) : (
                      relImg && (
                        <div className="h-44 w-full overflow-hidden border-b border-primary/20">
                          <img
                            src={relImg}
                            alt={normalizeDisplayCaps(rel.title)}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 block"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      )
                    )}
                    <div className="p-5 space-y-2">
                      <BubbleElement isBadge active size="sm" className="max-w-full whitespace-normal">
                        {relBadge}
                      </BubbleElement>
                      <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 break-words">
                        {normalizeDisplayCaps(rel.title)}
                      </h3>
                      <p className="text-sm text-foreground/75 line-clamp-3 break-words">
                        {normalizeDisplayCaps(rel.excerpt || rel.seo_description)}
                      </p>
                    </div>
                  </div>
                  <div className="px-5 pb-5 pt-2 flex items-center justify-between text-sm font-bold text-primary">
                    <span>Читать статью полностью</span>
                    <span>→</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Landing Page Footer */}
      <SiteFooter />
    </div>
  );
}
