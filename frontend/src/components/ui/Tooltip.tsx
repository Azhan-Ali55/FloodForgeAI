import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { cn } from '../../utils/cn';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
  delayMs?: number;
  className?: string;
}

/**
 * Accessible, portal-rendered contextual tooltip with hover delay, keyboard focus,
 * Escape dismissal, and viewport-aware clamping.
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 160,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({
    top: 0,
    left: 0,
    placement: side,
  });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<number | null>(null);
  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedH = 40;
    let placement: 'top' | 'bottom' = side;
    if (side === 'top' && rect.top < estimatedH + 16) {
      placement = 'bottom';
    } else if (side === 'bottom' && window.innerHeight - rect.bottom < estimatedH + 16) {
      placement = 'top';
    }

    const rawLeft = rect.left + rect.width / 2;
    const clampedLeft = Math.min(Math.max(rawLeft, 120), window.innerWidth - 120);
    const top = placement === 'top' ? rect.top - 8 : rect.bottom + 8;

    setCoords({ top, left: clampedLeft, placement });
  }, [side]);

  const show = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, delayMs);
  }, [delayMs, updatePosition]);

  const hide = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, hide, updatePosition]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!content) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-describedby={open ? tooltipId : undefined}
        className={cn('inline-flex items-center', className)}
      >
        {children}
      </span>
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tooltipId}
            role="tooltip"
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              transform:
                coords.placement === 'top'
                  ? 'translate(-50%, -100%)'
                  : 'translate(-50%, 0)',
              zIndex: 9999,
            }}
            className="pointer-events-none max-w-[230px] px-2.5 py-1.5 rounded-lg bg-[#10223D] text-white text-[11px] leading-snug shadow-lg border border-white/10"
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Touch-accessible info icon button for technical labels.
 */
export function InfoTip({ content, label = 'More information' }: { content: string; label?: string }) {
  const [pinned, setPinned] = useState(false);

  return (
    <Tooltip content={content}>
      <button
        type="button"
        onClick={() => setPinned((v) => !v)}
        onBlur={() => setPinned(false)}
        aria-label={label}
        aria-expanded={pinned}
        title={content}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[#64748B] hover:text-[#12345B] hover:bg-[#E2E8F0]/60 transition-colors cursor-pointer"
      >
        <Info className="w-3 h-3" />
      </button>
    </Tooltip>
  );
}
