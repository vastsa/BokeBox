import { useMemo, useState } from 'react';
import type { Flashcard } from '../types/job';

export function FlashcardsView({
  cards,
  emptyText = '暂无知识闪卡',
  compact = false,
}: {
  cards?: Flashcard[] | null;
  emptyText?: string;
  /** 听播页更紧凑 */
  compact?: boolean;
}) {
  const list = useMemo(
    () => (Array.isArray(cards) ? cards.filter((c) => c.front && c.back) : []),
    [cards],
  );
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<string, boolean>>({});

  if (!list.length) {
    return <div className={compact ? 'qq-empty' : 'jd-placeholder soft'}>{emptyText}</div>;
  }

  const safeIndex = Math.min(index, list.length - 1);
  const card = list[safeIndex];
  const knownCount = list.filter((c) => known[c.id]).length;

  const go = (next: number) => {
    const n = (next + list.length) % list.length;
    setIndex(n);
    setFlipped(false);
  };

  return (
    <div className={['fc-root', compact ? 'is-compact' : ''].filter(Boolean).join(' ')}>
      <div className="fc-toolbar">
        <div className="fc-progress">
          <strong>
            {safeIndex + 1}
            <span> / {list.length}</span>
          </strong>
          <em>已掌握 {knownCount}</em>
        </div>
        <div className="fc-dots" aria-hidden>
          {list.map((c, i) => (
            <i
              key={c.id}
              className={[
                i === safeIndex ? 'is-active' : '',
                known[c.id] ? 'is-known' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          ))}
        </div>
      </div>

      <button
        type="button"
        className={['fc-card', flipped ? 'is-flipped' : ''].join(' ')}
        onClick={() => setFlipped((v) => !v)}
        aria-label={flipped ? '显示正面' : '显示背面'}
      >
        <div className="fc-face fc-front">
          <span className="fc-kicker">问题 · 概念</span>
          <p>{card.front}</p>
          {card.hint && !flipped && <small>提示：{card.hint}</small>}
          {!!card.tags?.length && (
            <div className="fc-tags">
              {card.tags.map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          )}
          <em className="fc-tip">点击翻转</em>
        </div>
        <div className="fc-face fc-back">
          <span className="fc-kicker">答案 · 解释</span>
          <p>{card.back}</p>
          <em className="fc-tip">点击翻回</em>
        </div>
      </button>

      <div className="fc-actions">
        <button type="button" className="nl-btn nl-btn-secondary" onClick={() => go(safeIndex - 1)}>
          上一张
        </button>
        <button
          type="button"
          className={[
            'nl-btn',
            known[card.id] ? 'nl-btn-secondary' : 'nl-btn-primary',
          ].join(' ')}
          onClick={() =>
            setKnown((prev) => ({
              ...prev,
              [card.id]: !prev[card.id],
            }))
          }
        >
          {known[card.id] ? '取消掌握' : '已掌握'}
        </button>
        <button type="button" className="nl-btn nl-btn-secondary" onClick={() => go(safeIndex + 1)}>
          下一张
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
                <span className="fc-list-front">{c.front}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
