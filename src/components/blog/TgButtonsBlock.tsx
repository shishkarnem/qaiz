import React from 'react';
import { ExternalLink } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { TgButtonItem, sanitizeBlogUrl } from './urlSafety';

interface TgButtonsBlockProps {
  rows: TgButtonItem[][];
}

export const TgButtonsBlock: React.FC<TgButtonsBlockProps> = ({ rows }) => {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const validRows = rows
    .map((row) =>
      Array.isArray(row)
        ? row
            .map((btn) => ({
              text: String(btn?.text || '').trim(),
              url: sanitizeBlogUrl(btn?.url),
              isTelegramFallback: Boolean(btn?.isTelegramFallback),
            }))
            .filter((btn) => btn.text && btn.url)
        : []
    )
    .filter((row) => row.length > 0);

  if (validRows.length === 0) return null;

  return (
    <div className="my-5 space-y-2.5">
      {validRows.map((row, rowIdx) => (
        <div
          key={`tg-btn-row-${rowIdx}`}
          className="flex flex-wrap items-center gap-2.5"
        >
          {row.map((btn, btnIdx) => (
            <a
              key={`tg-btn-${rowIdx}-${btnIdx}`}
              href={btn.url}
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline max-w-full"
            >
              <BubbleElement
                as="div"
                active={!btn.isTelegramFallback}
                size="md"
                icon={<ExternalLink size={15} />}
                className="max-w-full whitespace-normal"
              >
                {btn.text}
              </BubbleElement>
            </a>
          ))}
        </div>
      ))}
    </div>
  );
};
