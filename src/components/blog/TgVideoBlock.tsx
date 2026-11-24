import React from 'react';
import { ExternalLink, Film } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { TgMediaItem, sanitizeBlogUrl, isVideoMediaUrl, normalizeDisplayCaps } from './urlSafety';

interface TgVideoBlockProps {
  item: TgMediaItem;
  fallbackPostUrl?: string;
}

export const TgVideoBlock: React.FC<TgVideoBlockProps> = ({ item, fallbackPostUrl }) => {
  const videoUrl = sanitizeBlogUrl(item?.url);
  const rawPoster = sanitizeBlogUrl(item?.posterUrl);
  const safePoster = rawPoster && !isVideoMediaUrl(rawPoster) ? rawPoster : '';
  const telegramUrl = sanitizeBlogUrl(item?.postUrl || fallbackPostUrl);
  const captionText = normalizeDisplayCaps(item?.caption);

  // Rule: When playable video exists and is not tooLarge (>20MB), render <video> directly WITHOUT poster
  if (!item?.tooLarge && videoUrl) {
    return (
      <figure className="my-5 overflow-hidden rounded-2xl border border-primary/30 bg-transparent backdrop-blur-2xl shadow-lg">
        <video
          src={videoUrl}
          controls
          playsInline
          preload="auto"
          className="w-full max-h-[540px] object-contain bg-transparent block"
        />
        {captionText && (
          <figcaption className="px-4 py-3 text-sm text-foreground/85 border-t border-primary/20 break-words leading-relaxed">
            {captionText}
          </figcaption>
        )}
      </figure>
    );
  }

  // Fallback card for videos > 20 MB (tooLarge) or missing direct video file
  return (
    <div className="my-5 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {safePoster && (
        <div className="overflow-hidden rounded-xl border border-primary/25 bg-transparent">
          <img
            src={safePoster}
            alt={captionText || 'Превью видео из Telegram'}
            className="w-full max-h-[420px] object-cover block"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-transparent text-primary">
            <Film size={16} />
          </span>
          <div className="min-w-0 space-y-1">
            <div className="text-sm font-bold text-foreground break-words">
              {item?.tooLarge
                ? 'Видео превышает лимит 20 МБ и открывается в оригинале в Telegram'
                : 'Видео опубликовано в оригинальном посте Telegram'}
            </div>
            {captionText && (
              <p className="text-sm text-foreground/75 break-words leading-relaxed">{captionText}</p>
            )}
          </div>
        </div>

        {telegramUrl && (
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="no-underline shrink-0 max-w-full"
          >
            <BubbleElement
              as="div"
              active
              size="md"
              icon={<ExternalLink size={15} />}
              className="whitespace-normal max-w-full"
            >
              Смотреть видео в Telegram
            </BubbleElement>
          </a>
        )}
      </div>
    </div>
  );
};
