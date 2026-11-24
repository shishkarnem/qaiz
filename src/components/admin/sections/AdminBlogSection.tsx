import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Edit2, Trash2, Rss, Loader2, CheckCircle2, AlertCircle, Pin } from 'lucide-react';
import { BlogEditor } from '../../BlogEditor';
import { BubbleElement } from '../../ui/BubbleElement';
import { LeafButton } from '../../ui/LeafButton';
import { DIRECT_MEDIA_URLS } from '../../../shared/mediaUrls';
import { sanitizeBlogUrl, isVideoMediaUrl, normalizeDisplayCaps } from '../../blog/urlSafety';

const PRIORITY_GAME_IDS = ['blitz', 'millionaire', '100to1', 'whatwherewhen', 'jeopardy'];
const MAX_PINNED_POSTS = 10;

interface AdminBlogSectionProps {
  postsList: any[];
  editingPost: any;
  setEditingPost: (p: any) => void;
  postForm: any;
  setPostForm: (f: any) => void;
  handleSavePost: () => void;
  handleDeletePost: (id: number) => void;
  fetchPosts: () => void;
  pinnedCount?: number;
  pinningPostId?: string | null;
  handleTogglePinPost?: (post: any) => void;
  rssSyncLoading?: boolean;
  rssSyncResult?: any;
  handleSyncRssFeed?: () => void;
}

export const AdminBlogSection: React.FC<AdminBlogSectionProps> = ({
  postsList,
  editingPost,
  setEditingPost,
  postForm,
  setPostForm,
  handleSavePost,
  handleDeletePost,
  fetchPosts,
  pinnedCount = 0,
  pinningPostId = null,
  handleTogglePinPost,
  rssSyncLoading = false,
  rssSyncResult = null,
  handleSyncRssFeed,
}) => {
  const resetForm = () => {
    setEditingPost(null);
    setPostForm({
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
  };

  return (
    <div className="space-y-6">
      {/* RSS 2.0 SAV AI Sync Panel */}
      <div className="p-5 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Rss size={20} className="text-primary shrink-0" />
              <span>Автоимпорт статей SAV AI (RSS 2.0)</span>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Автосинхронизация каждые 10 минут по резервной цепочке доменов savbot.ru, sav-ai.ru, aisav.ru, ai-greenland.ru, aisav.online.
            </p>
          </div>

          {handleSyncRssFeed && (
            <LeafButton
              variant="primary"
              size="md"
              disabled={rssSyncLoading}
              onClick={handleSyncRssFeed}
              icon={rssSyncLoading ? <Loader2 size={16} className="animate-spin" /> : <Rss size={16} />}
              className="shrink-0"
            >
              {rssSyncLoading ? 'Синхронизация...' : 'Синхронизировать RSS сейчас'}
            </LeafButton>
          )}
        </div>

        {rssSyncResult && (
          <div
            className={`p-4 rounded-2xl border bg-transparent backdrop-blur-xl text-sm flex flex-wrap items-center justify-between gap-3 ${
              rssSyncResult.success
                ? 'border-primary/40 text-foreground/90'
                : 'border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {rssSyncResult.success ? (
                <CheckCircle2 size={18} className="text-primary shrink-0" />
              ) : (
                <AlertCircle size={18} className="text-rose-400 shrink-0" />
              )}
              <span className="break-words">
                {rssSyncResult.success
                  ? `Источник: ${rssSyncResult.sourceDomain || 'savbot.ru'} • Всего в ленте: ${rssSyncResult.totalFetched} • Добавлено: ${rssSyncResult.added} • Обновлено: ${rssSyncResult.updated} • Пропущено: ${rssSyncResult.skipped}`
                  : rssSyncResult.error || 'Не удалось выполнить синхронизацию'}
              </span>
            </div>
            {rssSyncResult.syncedAt && (
              <BubbleElement isBadge size="sm">
                {new Date(rssSyncResult.syncedAt).toLocaleString('ru-RU')}
              </BubbleElement>
            )}
          </div>
        )}
      </div>

      <BlogEditor
        postForm={postForm}
        setPostForm={setPostForm}
        onSave={handleSavePost}
        onCancel={resetForm}
        isEditing={!!editingPost}
      />

      <div className="p-5 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg font-bold text-foreground">
              Опубликованные статьи блога ({postsList.length})
            </h3>
            <BubbleElement
              isBadge
              active={pinnedCount > 0}
              size="sm"
              icon={<Pin size={14} />}
            >
              Закреплено: {pinnedCount} / {MAX_PINNED_POSTS}
            </BubbleElement>
          </div>
          <BubbleElement
            size="sm"
            onClick={fetchPosts}
            icon={<RefreshCw size={16} className="text-primary" />}
            title="Обновить список статей"
          />
        </div>

        <p className="text-sm text-foreground/75 leading-relaxed">
          Первые 5 обзоров игр (КвИИз, Квиллионер, Сто Квадному, Что? Где? Квада?, Своя Икра) всегда идут в начале ленты блога. Дополнительно вы можете закрепить до {MAX_PINNED_POSTS} любых статей сразу после них.
        </p>

        <div className="grid gap-4">
          {postsList.length > 0 ? (
            postsList.map(post => {
              const videoUrl = sanitizeBlogUrl(post.cover_video_url);
              const rawImgUrl = sanitizeBlogUrl(post.cover_image_url || post.image_url);
              const imgUrl = rawImgUrl && !isVideoMediaUrl(rawImgUrl) ? rawImgUrl : '';
              const displayTitle = normalizeDisplayCaps(post.title);
              const priorityRank = !post.external_id
                ? PRIORITY_GAME_IDS.indexOf(String(post.game_id || '')) + 1
                : 0;
              const isPinned = Number(post.is_pinned || 0) === 1;
              const isPinBusy = pinningPostId === String(post.id);
              const canPinMore = isPinned || pinnedCount < MAX_PINNED_POSTS;

              return (
                <div
                  key={post.id}
                  className="p-5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl flex flex-col sm:flex-row items-start justify-between gap-4 hover:border-primary/50 transition-all"
                >
                  {videoUrl ? (
                    <div className="relative aspect-video w-full sm:w-44 shrink-0 rounded-xl overflow-hidden border border-primary/30 bg-transparent">
                      <video
                        src={videoUrl}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover object-center block"
                      />
                    </div>
                  ) : (
                    imgUrl && (
                      <div className="relative aspect-video w-full sm:w-44 shrink-0 rounded-xl overflow-hidden border border-primary/30 bg-transparent">
                        <img
                          src={imgUrl}
                          alt={displayTitle || 'Обложка'}
                          className="w-full h-full object-cover object-center block"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )
                  )}
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-lg font-bold text-foreground break-words">{displayTitle}</h4>
                      {priorityRank > 0 && (
                        <BubbleElement isBadge active size="sm" icon={<Pin size={14} />} className="!text-sm">
                          Приоритет #{priorityRank} (всегда в топе)
                        </BubbleElement>
                      )}
                      {priorityRank === 0 && isPinned && (
                        <BubbleElement isBadge active size="sm" icon={<Pin size={14} />} className="!text-sm">
                          Закреплено
                        </BubbleElement>
                      )}
                      {post.game_id && (
                        <BubbleElement isBadge size="sm" className="!text-sm text-primary border-primary/35">
                          Игра: {post.game_id}
                        </BubbleElement>
                      )}
                      {post.category && (
                        <BubbleElement isBadge size="sm" className="!text-sm text-primary border-primary/35 max-w-full whitespace-normal">
                          {normalizeDisplayCaps(post.category)}
                        </BubbleElement>
                      )}
                      {post.external_id && (
                        <BubbleElement isBadge size="sm" className="!text-sm">
                          RSS SAV AI
                        </BubbleElement>
                      )}
                      <BubbleElement isBadge size="sm" className="!text-sm">
                        {(post.content || '').length} симв.
                      </BubbleElement>
                    </div>
                    <p className="text-sm text-foreground/75 line-clamp-2 break-words">
                      {normalizeDisplayCaps(post.excerpt || post.content)}
                    </p>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/65">
                      <span>
                        Дата: {new Date(post.published_at || post.created_at || Date.now()).toLocaleDateString('ru-RU')}
                      </span>
                      {post.slug && (
                        <Link to={`/blog/${post.slug}`} className="text-primary hover:underline font-mono break-all">
                          /blog/{post.slug}
                        </Link>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {priorityRank === 0 && handleTogglePinPost && (
                      <BubbleElement
                        as="button"
                        type="button"
                        size="sm"
                        active={isPinned}
                        disabled={isPinBusy || !canPinMore}
                        onClick={() => handleTogglePinPost(post)}
                        icon={isPinBusy ? <Loader2 size={15} className="animate-spin" /> : <Pin size={15} />}
                        title={
                          !canPinMore
                            ? `Достигнут лимит закреплённых постов (${MAX_PINNED_POSTS})`
                            : isPinned
                            ? 'Открепить пост'
                            : 'Закрепить пост в начале ленты'
                        }
                      >
                        {isPinned ? 'Открепить' : 'Закрепить'}
                      </BubbleElement>
                    )}
                    <BubbleElement
                      size="sm"
                      onClick={() => {
                        setEditingPost(post);
                        setPostForm({
                          title: post.title || '',
                          slug: post.slug || '',
                          game_id: post.game_id || '',
                          excerpt: post.excerpt || '',
                          content: post.content || '',
                          image_url: post.cover_image_url || post.image_url || DIRECT_MEDIA_URLS.GAME_BLITZ,
                          seo_title: post.seo_title || '',
                          seo_description: post.seo_description || '',
                          seo_keywords: post.seo_keywords || '',
                          cover_prompt: post.cover_prompt || '',
                          author_name: post.author_name || 'Редакция КвИИз',
                          platforms: post.platforms || 'app',
                          scheduled_at: post.scheduled_at || ''
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      icon={<Edit2 size={16} className="text-primary" />}
                      title="Редактировать статью"
                    />
                    <BubbleElement
                      size="sm"
                      onClick={() => handleDeletePost(post.id)}
                      className="border-rose-500/35 text-rose-400"
                      icon={<Trash2 size={16} />}
                      title="Удалить статью"
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10 text-sm text-foreground/55 italic">
              Статей в блоге пока нет. Нажмите «Синхронизировать RSS сейчас» или напишите публикацию вручную выше.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
