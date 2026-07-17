import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import type { Flashcard } from '../types/job';
import { IconCheck, IconSkipBack, IconSkipForward } from './icons';
import { useI18n } from '../i18n';

export function FlashcardsView({
  cards,
  emptyText: emptyTextProp,
  compact = false,
}: {
  cards?: Flashcard[] | null;
  emptyText?: string;
  /** 听播页更紧凑 */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const emptyText = emptyTextProp ?? t('flashcards.empty');
  const list = useMemo(
    () => (Array.isArray(cards) ? cards.filter((c) => c.front && c.back) : []),
    [cards],
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<string, boolean>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [swipeHint, setSwipeHint] = useState<'left' | 'right' | null>(null);

  const safeIndex = list.length ? Math.min(index, list.length - 1) : 0;
  const card = list[safeIndex];
  const knownCount = list.filter((c) => known[c.id]).length;
  const progressPct = list.length ? ((safeIndex + 1) / list.length) * 100 : 0;
  const masteredPct = list.length ? (knownCount / list.length) * 100 : 0;
  const isKnown = Boolean(card && known[card.id]);

  // 列表变化时复位
  useEffect(() => {
    setIndex(0);
    setFlipped(false);
    setKnown({});
  }, [list]);

  const go = useCallback(
    (next: number) => {
      if (!list.length) return;
      const n = ((next % list.length) + list.length) % list.length;
      setIndex(n);
      setFlipped(false);
      setSwipeHint(null);
    },
    [list.length],
  );

  const toggleKnown = useCallback(
    (andNext = false) => {
      if (!card) return;
      setKnown((prev) => ({
        ...prev,
        [card.id]: !prev[card.id],
      }));
      // 标记掌握后自动进入下一张，提升复习流
      if (andNext && safeIndex < list.length - 1) {
        window.setTimeout(() => go(safeIndex + 1), 180);
      }
    },
    [card, go, list.length, safeIndex],
  );

  // 键盘：← → 翻页，Space/Enter 翻转，K 掌握
  useEffect(() => {
    if (!list.length) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(safeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(safeIndex + 1);
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        toggleKnown(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, list.length, safeIndex, toggleKnown]);

  // 点状进度：过多时只展示附近窗口
  const dotWindow = useMemo(() => {
    const max = compact ? 12 : 16;
    if (list.length <= max) {
      return list.map((c, i) => ({ c, i }));
    }
    const half = Math.floor(max / 2);
    let start = Math.max(0, safeIndex - half);
    let end = Math.min(list.length, start + max);
    start = Math.max(0, end - max);
    const items: Array<{ c: Flashcard; i: number }> = [];
    for (let i = start; i < end; i++) items.push({ c: list[i], i });
    return items;
  }, [compact, list, safeIndex]);

  if (!list.length || !card) {
    return (
      <div className={compact ? 'qq-empty fc-empty' : 'jd-placeholder soft fc-empty'}>
        {emptyText}
      </div>
    );
  }

  const onTouchStart = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    setSwipeHint(null);
  };

  const onTouchMove = (e: TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      setSwipeHint(dx > 0 ? 'right' : 'left');
    } else {
      setSwipeHint(null);
    }
  };

  const onTouchEnd = (e: TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    setSwipeHint(null);
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    // 水平滑动切卡：阈值适中，避免与纵向滚动冲突
    if (dt < 650 && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.35) {
      if (dx < 0) go(safeIndex + 1);
      else go(safeIndex - 1);
    }
  };

  return (
    <div
      ref={rootRef}
      className={['fc-root', compact ? 'is-compact' : 'is-full', flipped ? 'is-showing-back' : '']
        .filter(Boolean)
        .join(' ')}
      tabIndex={-1}
    >
      <div className="fc-toolbar">
        <div className="fc-progress">
          <strong>
            {safeIndex + 1}
            <span> / {list.length}</span>
          </strong>
          <em>
            {t('flashcards.masteredCount', { n: knownCount })}
            {knownCount > 0 && (
              <span className="fc-mastered-pct"> · {Math.round(masteredPct)}%</span>
            )}
          </em>
        </div>

        <div className="fc-track" aria-hidden>
          <i className="fc-track-total" style={{ width: `${progressPct}%` }} />
          <i className="fc-track-known" style={{ width: `${masteredPct}%` }} />
        </div>

        <div className="fc-dots" aria-hidden>
          {list.length > (compact ? 12 : 16) && safeIndex > 6 && (
            <span className="fc-dots-more">…</span>
          )}
          {dotWindow.map(({ c, i }) => (
            <button
              key={c.id}
              type="button"
              className={[
                'fc-dot',
                i === safeIndex ? 'is-active' : '',
                known[c.id] ? 'is-known' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                setIndex(i);
                setFlipped(false);
              }}
              aria-label={t('flashcards.cardIndex', { n: i + 1 })}
            />
          ))}
          {list.length > (compact ? 12 : 16) && safeIndex < list.length - 6 && (
            <span className="fc-dots-more">…</span>
          )}
        </div>
      </div>

      <div
        className={[
          'fc-stage',
          swipeHint === 'left' ? 'is-swipe-left' : '',
          swipeHint === 'right' ? 'is-swipe-right' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          className={['fc-card', flipped ? 'is-flipped' : '', isKnown ? 'is-known' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => setFlipped((v) => !v)}
          aria-label={flipped ? t('flashcards.showFront') : t('flashcards.showBack')}
        >
          <div className="fc-face fc-front">
            <div className="fc-face-top">
              <span className="fc-kicker">{t('flashcards.question')}</span>
              {isKnown && (
                <span className="fc-known-badge">
                  <IconCheck size={12} />
                  {t('flashcards.mastered')}
                </span>
              )}
            </div>
            <div className="fc-face-body">
              <p>{card.front}</p>
              {card.hint && !flipped && <small>{t('flashcards.hint', { hint: card.hint })}</small>}
              {!!card.tags?.length && (
                <div className="fc-tags">
                  {card.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </div>
            <em className="fc-tip">
              <span className="fc-tip-desktop">{t('flashcards.tipDesktop')}</span>
              <span className="fc-tip-mobile">{t('flashcards.tipMobile')}</span>
            </em>
          </div>
          <div className="fc-face fc-back">
            <div className="fc-face-top">
              <span className="fc-kicker">{t('flashcards.answer')}</span>
              {isKnown && (
                <span className="fc-known-badge">
                  <IconCheck size={12} />
                  {t('flashcards.mastered')}
                </span>
              )}
            </div>
            <div className="fc-face-body">
              <p>{card.back}</p>
            </div>
            <em className="fc-tip">
              <span className="fc-tip-desktop">{t('flashcards.tipBackDesktop')}</span>
              <span className="fc-tip-mobile">{t('flashcards.tipBackMobile')}</span>
            </em>
          </div>
        </button>
      </div>

      <div className="fc-actions">
        <button
          type="button"
          className="fc-act fc-act-nav"
          onClick={() => go(safeIndex - 1)}
          aria-label={t('flashcards.prev')}
        >
          <IconSkipBack size={16} />
          <span>{t('flashcards.prev')}</span>
        </button>
        <button
          type="button"
          className={['fc-act', 'fc-act-known', isKnown ? 'is-on' : ''].filter(Boolean).join(' ')}
          onClick={() => toggleKnown(!isKnown)}
          aria-pressed={isKnown}
        >
          <IconCheck size={16} />
          <span>{isKnown ? t('flashcards.unmaster') : t('flashcards.mastered')}</span>
        </button>
        <button
          type="button"
          className="fc-act fc-act-nav"
          onClick={() => go(safeIndex + 1)}
          aria-label={t('flashcards.next')}
        >
          <span>{t('flashcards.next')}</span>
          <IconSkipForward size={16} />
        </button>
      </div>

      {!compact && (
        <ol className="fc-list">
          {list.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={[
                  'fc-list-item',
                  i === safeIndex ? 'is-active' : '',
                  known[c.id] ? 'is-known' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  setIndex(i);
                  setFlipped(false);
                }}
              >
                <span className="fc-list-idx">{String(i + 1).padStart(2, '0')}</span>
                <span className="fc-list-main">
                  <span className="fc-list-front">{c.front}</span>
                  {known[c.id] && <span className="fc-list-known">{t('flashcards.mastered')}</span>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
