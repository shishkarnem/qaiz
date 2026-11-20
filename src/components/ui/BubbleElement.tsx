import React from 'react';
import { audioSystem } from '../../hooks/useSound';

interface BubbleElementProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  isBadge?: boolean;
  as?: 'button' | 'div';
}

export const BubbleElement: React.FC<BubbleElementProps> = ({
  active = false,
  children,
  icon,
  size = 'md',
  isBadge = false,
  as,
  className = '',
  onClick,
  onMouseEnter,
  disabled,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-2.5 text-sm md:text-base font-bold'
  };

  const style: React.CSSProperties = {
    background: active
      ? 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.95) 0%, rgba(131, 196, 46, 0.8) 65%, rgba(100, 160, 30, 0.6) 100%)'
      : 'radial-gradient(circle at 35% 30%, rgba(153, 208, 55, 0.2) 0%, rgba(131, 196, 46, 0.1) 60%, rgba(255, 255, 255, 0.05) 100%)',
    boxShadow: active
      ? 'inset 2px 2px 5px rgba(255, 255, 255, 0.8), 0 0 16px rgba(153, 208, 55, 0.5)'
      : 'inset 1px 1px 3px rgba(255, 255, 255, 0.4), 0 0 8px rgba(153, 208, 55, 0.15)',
    border: active ? '1.5px solid rgba(255, 255, 255, 0.9)' : '1px solid rgba(153, 208, 55, 0.35)',
  };

  const scaleClasses = className.includes('w-full')
    ? 'hover:brightness-110 active:scale-[0.99] min-w-0 max-w-full'
    : 'hover:scale-[1.05] active:scale-[0.95]';

  const innerContent = (
    <>
      {/* 3D Glass Glare Highlight */}
      <span className="absolute top-[12%] left-[12%] w-[25%] h-[25%] rounded-full bg-white/60 blur-[0.5px] pointer-events-none" />

      {/* Icon */}
      {icon && <span className={`relative z-10 shrink-0 ${active ? 'text-black' : 'text-primary'}`}>{icon}</span>}

      {/* Children */}
      {children && (
        <span className={`relative z-10 font-bold normal-case tracking-normal min-w-0 leading-tight ${(className.includes('w-full') || className.includes('max-w-full') || className.includes('whitespace-normal')) ? (!icon ? 'w-full whitespace-normal break-words' : 'whitespace-normal break-words') : 'whitespace-nowrap'} ${active ? 'text-black font-black' : 'text-foreground'}`}>
          {children}
        </span>
      )}
    </>
  );

  const shouldRenderAsDiv = as === 'div' || isBadge;

  if (shouldRenderAsDiv) {
    return (
      <div
        role={onClick ? 'button' : undefined}
        tabIndex={onClick && !disabled ? 0 : undefined}
        onClick={
          disabled
            ? undefined
            : onClick
            ? (e) => {
                audioSystem.playSlot('ui_btn_bubble_click');
                (onClick as any)(e);
              }
            : undefined
        }
        onMouseEnter={
          disabled || !onClick
            ? undefined
            : (e) => {
                audioSystem.playSlot('ui_btn_hover');
                (onMouseEnter as any)?.(e);
              }
        }
        onKeyDown={onClick && !disabled ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            audioSystem.playSlot('ui_btn_bubble_click');
            (onClick as any)(e);
          }
        } : undefined}
        className={`relative inline-flex items-center justify-center gap-2 rounded-full overflow-hidden transition-all duration-300 ${sizeClasses[size]} ${onClick ? `cursor-pointer ${scaleClasses}` : ''} ${disabled ? 'opacity-50 pointer-events-none' : ''} ${className}`}
        style={style}
      >
        {innerContent}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        if (!disabled) {
          audioSystem.playSlot('ui_btn_bubble_click');
        }
        onClick?.(e);
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          audioSystem.playSlot('ui_btn_hover');
        }
        onMouseEnter?.(e);
      }}
      disabled={disabled}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full overflow-hidden transition-all duration-300 cursor-pointer ${scaleClasses} disabled:opacity-50 disabled:pointer-events-none ${sizeClasses[size]} ${className}`}
      style={style}
      {...props}
    >
      {innerContent}
    </button>
  );
};
