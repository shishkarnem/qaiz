import React, { useState, useEffect } from 'react';
import { X, ZoomIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { TgMediaItem, sanitizeBlogUrl, isVideoMediaUrl, normalizeDisplayCaps } from './urlSafety';
import { TgVideoBlock } from './TgVideoBlock';

interface TgGalleryBlockProps {
  items: TgMediaItem[];
  fallbackPostUrl?: string;
  eagerFirst?: boolean;
  defaultAlt?: string;
}

export const TgGalleryBlock: React.FC<TgGalleryBlockProps> = ({
  items,
  fallbackPostUrl,
  eagerFirst = false,
  defaultAlt,
}) => {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  const normalizedItems = Array.isArray(items) ? items : [];
  const photoItems = normalizedItems.filter((m) => {
    const safe = sanitizeBlogUrl(m?.url);
    if (!safe || isVideoMediaUrl(safe) || failedUrls[safe]) return false;
    const t = String(m?.type || '').toLowerCase();
    return !t || t === 'photo' || t === 'image';
  });
  const videoItems = normalizedItems.filter((m) => {
    const t = String(m?.type || '').toLowerCase();
    return t === 'video' || isVideoMediaUrl(m?.url);
  });

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight' && photoItems.length > 1) {
        setLightboxIdx((prev) => (prev === null ? null : (prev + 1) % photoItems.length));
      }
      if (e.key === 'ArrowLeft' && photoItems.length > 1) {
        setLightboxIdx((prev) => (prev === null ? null : (prev - 1 + photoItems.length) % photoItems.length));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxIdx, photoItems.length]);

  const gridColsClass =
    photoItems.length === 1
      ? 'grid-cols-1'
      : photoItems.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';

  return (
    <div className="my-5 space-y-4">
      {photoItems.length > 0 && (
        <div className={`grid ${gridColsClass} gap-3`}>
          {photoItems.map((photo, idx) => {
            const safeUrl = sanitizeBlogUrl(photo.url);
            const captionText = normalizeDisplayCaps(photo.caption);
            const altText = captionText || defaultAlt || `Фото ${idx + 1}`;
            return (
              <div
                key={`tg-photo-${idx}-${safeUrl.slice(-16)}`}
                role="button"
                tabIndex={0}
                onClick={() => setLightboxIdx(idx)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setLightboxIdx(idx);
                  }
                }}
                className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl cursor-pointer transition-all hover:border-primary/70 shadow-md"
              >
                <div className={photoItems.length === 1 ? 'w-full' : 'aspect-[4/3] w-full overflow-hidden'}>
                  <img
                    src={safeUrl}
                    alt={altText}
                    className={`w-full ${
                      photoItems.length === 1 ? 'max-h-[540px] object-contain mx-auto' : 'h-full object-cover'
                    } group-hover:scale-[1.03] transition-transform duration-300 block`}
                    loading={eagerFirst && idx === 0 ? 'eager' : 'lazy'}
                    referrerPolicy="no-referrer"
                    onError={() =>
                      setFailedUrls((prev) => (prev[safeUrl] ? prev : { ...prev, [safeUrl]: true }))
                    }
                  />
                </div>
                <div className="pointer-events-none absolute top-3 right-3 opacity-85 group-hover:opacity-100 transition-opacity">
                  <BubbleElement isBadge size="sm" icon={<ZoomIn size={14} />} />
                </div>
                {captionText && (
                  <div className="px-3.5 py-2.5 text-sm text-foreground/85 border-t border-primary/20 break-words leading-snug">
                    {captionText}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {videoItems.map((vid, idx) => (
        <TgVideoBlock
          key={`tg-gallery-vid-${idx}`}
          item={vid}
          fallbackPostUrl={fallbackPostUrl}
        />
      ))}

      {lightboxIdx !== null && photoItems[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-transparent backdrop-blur-2xl"
          onClick={() => setLightboxIdx(null)}
        >
          <div
            className="relative max-w-5xl w-full rounded-3xl border border-primary/40 bg-transparent backdrop-blur-2xl p-3 sm:p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <BubbleElement isBadge size="sm">
                Фото {lightboxIdx + 1} из {photoItems.length}
              </BubbleElement>
              <div className="flex items-center gap-2">
                {photoItems.length > 1 && (
                  <>
                    <BubbleElement
                      size="sm"
                      onClick={() =>
                        setLightboxIdx((lightboxIdx - 1 + photoItems.length) % photoItems.length)
                      }
                      icon={<ChevronLeft size={16} />}
                      title="Предыдущее фото"
                    />
                    <BubbleElement
                      size="sm"
                      onClick={() => setLightboxIdx((lightboxIdx + 1) % photoItems.length)}
                      icon={<ChevronRight size={16} />}
                      title="Следующее фото"
                    />
                  </>
                )}
                <BubbleElement
                  size="sm"
                  active
                  onClick={() => setLightboxIdx(null)}
                  icon={<X size={16} />}
                  title="Закрыть просмотр"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-primary/25 bg-transparent flex items-center justify-center">
              <img
                src={sanitizeBlogUrl(photoItems[lightboxIdx].url)}
                alt={normalizeDisplayCaps(photoItems[lightboxIdx].caption) || 'Просмотр фото'}
                className="max-h-[75vh] w-auto max-w-full object-contain block"
                referrerPolicy="no-referrer"
              />
            </div>

            {photoItems[lightboxIdx].caption && (
              <p className="text-sm text-foreground/90 text-center break-words leading-relaxed px-2">
                {normalizeDisplayCaps(photoItems[lightboxIdx].caption)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
