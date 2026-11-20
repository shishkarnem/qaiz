import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Edit2, Trash2 } from 'lucide-react';
import { BlogEditor } from '../../BlogEditor';
import { BubbleElement } from '../../ui/BubbleElement';
import { DIRECT_MEDIA_URLS } from '../../../shared/mediaUrls';

interface AdminBlogSectionProps {
  postsList: any[];
  editingPost: any;
  setEditingPost: (p: any) => void;
  postForm: any;
  setPostForm: (f: any) => void;
  handleSavePost: () => void;
  handleDeletePost: (id: number) => void;
  fetchPosts: () => void;
}

export const AdminBlogSection: React.FC<AdminBlogSectionProps> = ({
  postsList,
  editingPost,
  setEditingPost,
  postForm,
  setPostForm,
  handleSavePost,
  handleDeletePost,
  fetchPosts
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
      <BlogEditor
        postForm={postForm}
        setPostForm={setPostForm}
        onSave={handleSavePost}
        onCancel={resetForm}
        isEditing={!!editingPost}
      />

      <div className="p-5 rounded-3xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-lg space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-foreground">
            Опубликованные SEO-статьи блога ({postsList.length})
          </h3>
          <BubbleElement
            size="sm"
            onClick={fetchPosts}
            icon={<RefreshCw size={16} className="text-primary" />}
            title="Обновить список статей"
          />
        </div>

        <div className="grid gap-4">
          {postsList.length > 0 ? (
            postsList.map(post => (
              <div
                key={post.id}
                className="p-5 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl flex flex-col sm:flex-row items-start justify-between gap-4 hover:border-primary/50 transition-all"
              >
                {post.image_url && (
                  <div className="relative aspect-video w-full sm:w-44 shrink-0 rounded-xl overflow-hidden border border-primary/30 bg-transparent">
                    <img
                      src={post.image_url}
                      alt={post.title || 'Обложка'}
                      className="w-full h-full object-cover object-center"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                )}
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-lg font-bold text-foreground break-words">{post.title}</h4>
                    {post.game_id && (
                      <BubbleElement isBadge size="sm" className="!text-sm text-primary border-primary/35">
                        Игра: {post.game_id}
                      </BubbleElement>
                    )}
                    <BubbleElement isBadge size="sm" className="!text-sm">
                      {(post.content || '').length} симв.
                    </BubbleElement>
                  </div>
                  <p className="text-sm text-foreground/75 line-clamp-2">{post.excerpt || post.content}</p>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/65">
                    <span>Дата: {new Date(post.created_at || Date.now()).toLocaleDateString('ru-RU')}</span>
                    {post.slug && (
                      <Link to={`/blog/${post.slug}`} className="text-primary hover:underline font-mono">
                        /blog/{post.slug}
                      </Link>
                    )}
                    {post.image_url && (
                      <span className="text-primary truncate max-w-[220px]">Обложка: {post.image_url}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <BubbleElement
                    size="sm"
                    onClick={() => {
                      setEditingPost(post);
                      setPostForm({
                        title: post.title || '',
                        slug: post.slug || '',
                        game_id: post.game_id || 'blitz',
                        excerpt: post.excerpt || '',
                        content: post.content || '',
                        image_url: post.image_url || DIRECT_MEDIA_URLS.GAME_BLITZ,
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
            ))
          ) : (
            <div className="text-center py-10 text-sm text-foreground/55 italic">
              Статей в блоге пока нет. Напишите первую публикацию выше!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
