import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Sparkles, Quote, ExternalLink, ChevronRight } from 'lucide-react';
import {
  sanitizeBlogUrl,
  isVideoMediaUrl,
  TgMediaItem,
  TgButtonItem,
  TgCollapseData,
} from './blog/urlSafety';
import { TgVideoBlock } from './blog/TgVideoBlock';
import { TgGalleryBlock } from './blog/TgGalleryBlock';
import { TgButtonsBlock } from './blog/TgButtonsBlock';
import { TgCollapseBlock } from './blog/TgCollapseBlock';

interface BlogArticleContentProps {
  content: string;
  telegramPostUrl?: string;
  className?: string;
}

function extractReactText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractReactText).join('');
  if (React.isValidElement(node)) {
    return extractReactText((node.props as any)?.children);
  }
  return '';
}

function extractCodeMetaFromPre(
  children: React.ReactNode,
  hastNode?: any
): { language: string; rawText: string } {
  let language = '';

  const firstElement = React.Children.toArray(children).find((c) => React.isValidElement(c));
  if (React.isValidElement(firstElement)) {
    const cls = String((firstElement.props as any)?.className || '');
    const match = cls.match(/language-([a-z0-9_-]+)/i);
    if (match) language = match[1].toLowerCase();
  }

  if (!language && hastNode?.children?.[0]) {
    const codePropsCls = hastNode.children[0]?.properties?.className;
    const joined = Array.isArray(codePropsCls)
      ? codePropsCls.join(' ')
      : String(codePropsCls || '');
    const match = joined.match(/language-([a-z0-9_-]+)/i);
    if (match) language = match[1].toLowerCase();
  }

  const rawText = extractReactText(children).replace(/\n$/, '');
  return { language, rawText };
}

export const BlogArticleContent: React.FC<BlogArticleContentProps> = ({
  content,
  telegramPostUrl,
  className = '',
}) => {
  return (
    <div
      className={`max-w-none min-w-0 break-words text-foreground/90 leading-relaxed text-base md:text-lg ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl md:text-3xl font-black text-primary mt-8 mb-4 flex items-start gap-3 tracking-tight leading-tight drop-shadow-[0_0_14px_rgba(182,255,46,0.2)] break-words">
              <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-transparent backdrop-blur-xl text-primary shadow-[0_0_12px_rgba(182,255,46,0.2)]">
                <Sparkles size={16} />
              </span>
              <span className="min-w-0 break-words">{children}</span>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl md:text-2xl font-black text-primary mt-8 mb-4 flex items-center gap-3 tracking-tight leading-snug border-b border-primary/25 pb-3 drop-shadow-[0_0_12px_rgba(182,255,46,0.18)] break-words">
              <span className="inline-flex h-6 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_10px_rgba(182,255,46,0.7)]" />
              <span className="min-w-0 break-words">{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg md:text-xl font-extrabold text-primary mt-6 mb-3 flex items-center gap-2 tracking-tight leading-snug break-words">
              <ChevronRight size={20} className="text-primary shrink-0" />
              <span className="min-w-0 break-words">{children}</span>
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base md:text-lg font-bold text-primary mt-5 mb-2 flex items-center gap-2 break-words">
              <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              <span className="min-w-0 break-words">{children}</span>
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-3.5 text-base md:text-lg text-foreground/90 leading-relaxed break-words">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-primary drop-shadow-[0_0_8px_rgba(182,255,46,0.18)]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-primary/90 font-medium">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="my-4 space-y-2 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl py-4 pr-4 pl-8 sm:py-5 sm:pr-6 sm:pl-9 list-disc marker:text-primary shadow-[0_8px_24px_rgba(0,0,0,0.2)] [&>li.task-list-item]:list-none [&>li.task-list-item]:-ml-4">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 space-y-2 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl py-4 pr-4 pl-8 sm:py-5 sm:pr-6 sm:pl-9 list-decimal marker:text-primary marker:font-black shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
              {children}
            </ol>
          ),
          li: ({ children, className: liClass }) => (
            <li
              className={`text-base md:text-lg text-foreground/95 leading-relaxed py-0.5 break-words ${
                liClass || ''
              }`}
            >
              {children}
            </li>
          ),
          input: ({ type, checked }) => {
            if (type !== 'checkbox') return null;
            return (
              <input
                type="checkbox"
                checked={Boolean(checked)}
                readOnly
                className="mr-2.5 h-4 w-4 accent-[#83c42e] rounded border-primary/50 bg-transparent align-middle"
              />
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-5 rounded-2xl rounded-tl-md border-l-4 border-primary border-t border-r border-b border-primary/30 bg-transparent backdrop-blur-2xl p-4 sm:p-5 shadow-[0_8px_30px_rgba(182,255,46,0.08)]">
              <div className="flex items-start gap-3">
                <Quote size={20} className="text-primary shrink-0 mt-1" />
                <div className="flex-1 min-w-0 text-base md:text-lg font-medium text-primary/95 italic leading-relaxed break-words">
                  {children}
                </div>
              </div>
            </blockquote>
          ),
          a: ({ href, children }) => {
            const safeHref = sanitizeBlogUrl(href);
            if (!safeHref) {
              return <span className="text-foreground/90 break-words">{children}</span>;
            }
            return (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary transition-colors break-all sm:break-words"
              >
                <span>{children}</span>
                <ExternalLink size={14} className="text-primary shrink-0" />
              </a>
            );
          },
          pre: ({ children, node }: any) => {
            const { language, rawText } = extractCodeMetaFromPre(children, node);

            if (language === 'tg-video') {
              try {
                const parsed = JSON.parse(rawText) as TgMediaItem;
                return <TgVideoBlock item={parsed} fallbackPostUrl={telegramPostUrl} />;
              } catch {
                // fall through to formatted code block
              }
            }

            if (language === 'tg-gallery') {
              try {
                const parsed = JSON.parse(rawText);
                const items: TgMediaItem[] = Array.isArray(parsed) ? parsed : [parsed];
                return <TgGalleryBlock items={items} fallbackPostUrl={telegramPostUrl} />;
              } catch {
                // fall through to formatted code block
              }
            }

            if (language === 'tg-buttons') {
              try {
                const parsed = JSON.parse(rawText);
                const rows: TgButtonItem[][] = Array.isArray(parsed) ? parsed : [];
                return <TgButtonsBlock rows={rows} />;
              } catch {
                // fall through to formatted code block
              }
            }

            if (language === 'tg-collapse') {
              try {
                const parsed = JSON.parse(rawText) as TgCollapseData;
                return (
                  <TgCollapseBlock
                    data={parsed}
                    renderMarkdown={(nestedMd) => (
                      <BlogArticleContent
                        content={nestedMd}
                        telegramPostUrl={telegramPostUrl}
                      />
                    )}
                  />
                );
              } catch {
                // fall through to formatted code block
              }
            }

            return (
              <pre className="my-5 max-w-full overflow-x-auto rounded-2xl border border-primary/30 bg-transparent backdrop-blur-2xl p-4 text-sm text-primary font-mono whitespace-pre-wrap break-words leading-relaxed">
                <code className="font-mono text-sm whitespace-pre-wrap break-words">
                  {rawText}
                </code>
              </pre>
            );
          },
          code: ({ className: codeClassName, children, ...props }: any) => (
            <code
              className={`rounded-lg border border-primary/35 bg-transparent backdrop-blur-md px-2 py-0.5 text-sm font-bold text-primary whitespace-pre-wrap break-words ${
                codeClassName || ''
              }`}
              {...props}
            >
              {children}
            </code>
          ),
          hr: () => (
            <hr className="my-7 border-t border-primary/30 shadow-[0_0_10px_rgba(182,255,46,0.2)]" />
          ),
          table: ({ children }) => (
            <div className="my-5 max-w-full overflow-x-auto rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl">
              <table className="w-full text-left border-collapse text-sm md:text-base">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-primary/30 px-4 py-3 font-black text-primary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-primary/15 px-4 py-3 text-foreground/90">
              {children}
            </td>
          ),
          img: ({ src, alt }) => {
            const safeSrc = sanitizeBlogUrl(src);
            if (!safeSrc) return null;
            if (isVideoMediaUrl(safeSrc)) {
              return (
                <TgVideoBlock
                  item={{ type: 'video', url: safeSrc, caption: alt }}
                  fallbackPostUrl={telegramPostUrl}
                />
              );
            }
            return (
              <span className="block my-5 overflow-hidden rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl shadow-xl">
                <img
                  src={safeSrc}
                  alt={alt || ''}
                  className="w-full h-auto object-cover block"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </span>
            );
          },
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
};
