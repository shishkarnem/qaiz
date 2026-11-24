import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Quote } from 'lucide-react';
import { BubbleElement } from '../ui/BubbleElement';
import { TgCollapseData, normalizeDisplayCaps } from './urlSafety';

interface TgCollapseBlockProps {
  data: TgCollapseData;
  renderMarkdown: (markdown: string) => React.ReactNode;
}

export const TgCollapseBlock: React.FC<TgCollapseBlockProps> = ({ data, renderMarkdown }) => {
  const hasSummary = Boolean(data?.summary && String(data.summary).trim());
  const [expanded, setExpanded] = useState<boolean>(
    hasSummary ? Boolean(data?.isOpen) : false
  );

  const summaryText = normalizeDisplayCaps(data?.summary);
  const creditText = normalizeDisplayCaps(data?.credit);
  const markdownBody = String(data?.markdown || '');

  // Mode 1: Accordion with summary (<details> style)
  if (hasSummary) {
    return (
      <div className="my-5 rounded-2xl border border-primary/35 bg-transparent backdrop-blur-2xl shadow-lg overflow-hidden">
        <div className="p-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex-1 min-w-0 text-left text-base font-bold text-foreground hover:text-primary transition-colors flex items-center justify-between gap-3 cursor-pointer"
          >
            <span className="min-w-0 break-words leading-snug">{summaryText}</span>
            <BubbleElement
              as="div"
              size="sm"
              active={expanded}
              icon={expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            >
              {expanded ? 'Скрыть' : 'Открыть'}
            </BubbleElement>
          </button>
        </div>

        {expanded && (
          <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-primary/20">
            {renderMarkdown(markdownBody)}
          </div>
        )}
      </div>
    );
  }

  // Mode 2: Telegram expandable blockquote (without summary)
  return (
    <blockquote className="my-5 rounded-2xl rounded-tl-md border-l-4 border-primary border-t border-r border-b border-primary/35 bg-transparent backdrop-blur-2xl p-4 sm:p-5 shadow-[0_8px_28px_rgba(182,255,46,0.08)] space-y-3">
      <div className="flex items-start gap-3">
        <Quote size={20} className="text-primary shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div
            className={`relative transition-all duration-300 ${
              expanded ? '' : 'max-h-36 overflow-hidden'
            }`}
          >
            {renderMarkdown(markdownBody)}
            {!expanded && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 backdrop-blur-[2px] border-b border-primary/15" />
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <BubbleElement
          as="button"
          type="button"
          size="sm"
          active={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          icon={expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        >
          {expanded ? 'Свернуть цитату' : 'Развернуть цитату'}
        </BubbleElement>

        {creditText && (
          <span className="text-sm font-medium text-foreground/75 break-words">
            — {creditText}
          </span>
        )}
      </div>
    </blockquote>
  );
};
