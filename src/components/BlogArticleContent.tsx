import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Sparkles, CheckCircle2, Quote, ExternalLink, ListOrdered, ChevronRight } from 'lucide-react';

interface BlogArticleContentProps {
  content: string;
  className?: string;
}

export const BlogArticleContent: React.FC<BlogArticleContentProps> = ({ content, className = '' }) => {
  return (
    <div className={`max-w-none text-foreground/90 leading-relaxed text-base md:text-lg ${className}`}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl md:text-4xl font-black text-primary mt-10 mb-5 flex items-start gap-3 tracking-tight leading-tight drop-shadow-[0_0_14px_rgba(182,255,46,0.2)]">
              <span className="mt-1.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-primary/40 bg-transparent backdrop-blur-xl text-primary shadow-[0_0_12px_rgba(182,255,46,0.2)]">
                <Sparkles size={16} />
              </span>
              <span>{children}</span>
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl md:text-3xl font-black text-primary mt-9 mb-4 flex items-center gap-3 tracking-tight leading-snug border-b border-primary/25 pb-3 drop-shadow-[0_0_12px_rgba(182,255,46,0.18)]">
              <span className="inline-flex h-6 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_10px_rgba(182,255,46,0.7)]" />
              <span>{children}</span>
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg md:text-2xl font-extrabold text-primary mt-7 mb-3 flex items-center gap-2.5 tracking-tight leading-snug">
              <ChevronRight size={20} className="text-primary shrink-0 drop-shadow-[0_0_8px_rgba(182,255,46,0.5)]" />
              <span>{children}</span>
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-base md:text-xl font-bold text-primary mt-6 mb-2.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary shrink-0 shadow-[0_0_8px_rgba(182,255,46,0.6)]" />
              <span>{children}</span>
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-4 text-base md:text-lg text-foreground/90 leading-relaxed">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-extrabold text-primary drop-shadow-[0_0_8px_rgba(182,255,46,0.18)]">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-primary/90 font-medium">
              {children}
            </em>
          ),
          ul: ({ children }) => (
            <ul className="my-5 space-y-3 rounded-2xl border border-primary/25 bg-transparent backdrop-blur-xl p-4 md:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-5 space-y-3 rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl p-4 md:p-6 list-decimal list-inside marker:text-primary marker:font-black shadow-[0_8px_24px_rgba(0,0,0,0.2)]">
              {children}
            </ol>
          ),
          li: ({ children, ordered }: any) => {
            if (ordered) {
              return (
                <li className="text-base md:text-lg text-foreground/90 leading-relaxed pl-2 py-1 border-b border-primary/10 last:border-b-0">
                  <span className="text-foreground/95">{children}</span>
                </li>
              );
            }
            return (
              <li className="flex items-start gap-3 text-base md:text-lg text-foreground/90 leading-relaxed py-1 border-b border-primary/10 last:border-b-0">
                <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-transparent text-primary shadow-[0_0_8px_rgba(182,255,46,0.25)]">
                  <CheckCircle2 size={13} className="text-primary" />
                </span>
                <div className="flex-1 min-w-0 text-foreground/95">{children}</div>
              </li>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-6 rounded-2xl rounded-tl-md border-l-4 border-primary border-t border-r border-b border-primary/30 bg-transparent backdrop-blur-2xl p-5 md:p-6 shadow-[0_8px_30px_rgba(182,255,46,0.08)]">
              <div className="flex items-start gap-3">
                <Quote size={22} className="text-primary shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(182,255,46,0.4)]" />
                <div className="flex-1 text-base md:text-lg font-medium text-primary/95 italic leading-relaxed">
                  {children}
                </div>
              </div>
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-primary underline decoration-primary/50 underline-offset-4 hover:decoration-primary transition-colors"
            >
              <span>{children}</span>
              <ExternalLink size={14} className="text-primary shrink-0" />
            </a>
          ),
          code: ({ className: codeClassName, children, ...props }: any) => {
            const isBlock = Boolean(codeClassName && codeClassName.includes('language-'));
            if (isBlock) {
              return (
                <pre className="my-5 overflow-x-auto rounded-2xl border border-primary/30 bg-transparent backdrop-blur-2xl p-4 text-sm text-primary font-mono">
                  <code className={codeClassName} {...props}>
                    {children}
                  </code>
                </pre>
              );
            }
            return (
              <code
                className="rounded-lg border border-primary/35 bg-transparent backdrop-blur-md px-2 py-0.5 text-sm font-bold text-primary"
                {...props}
              >
                {children}
              </code>
            );
          },
          hr: () => (
            <hr className="my-8 border-t border-primary/30 shadow-[0_0_10px_rgba(182,255,46,0.2)]" />
          ),
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl">
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
          img: ({ src, alt }) => (
            <span className="block my-6 overflow-hidden rounded-2xl border border-primary/30 bg-transparent backdrop-blur-xl shadow-xl">
              <img src={src} alt={alt || ''} className="w-full h-auto object-cover" referrerPolicy="no-referrer" />
            </span>
          )
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
};
