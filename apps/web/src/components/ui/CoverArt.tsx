import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from 'react';
import {
  coverGradientFor,
  coverLabelFrom,
  coverLabelTone,
  motifIndexFor,
} from '../../lib/format';

type CoverBase = {
  /** 稳定种子，通常为 job.id */
  seed?: string;
  /** 服务端/曲目预设的 Tailwind 渐变类 */
  preferred?: string;
  /** 用于封面标题排版的标题文案 */
  title?: string;
  className?: string;
  /** 是否显示标题文案（默认 true：按标题设计显示） */
  monogram?: boolean;
  /** 是否叠加纹理层 */
  pattern?: boolean;
  children?: ReactNode;
};

type CoverDivProps = CoverBase &
  Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'title'> & {
    as?: 'div';
  };

type CoverButtonProps = CoverBase &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className' | 'title'> & {
    as: 'button';
  };

type CoverSpanProps = CoverBase &
  Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'className' | 'title'> & {
    as: 'span';
  };

export type CoverArtProps = CoverDivProps | CoverButtonProps | CoverSpanProps;

/**
 * 全局占位封面：渐变 + 纹理变体 + 标题排版
 * 默认按完整标题设计显示，而不是单字 monogram
 * 可直接挂载既有尺寸 class（如 nc-album-art / global-player-cover）
 */
export function CoverArt(props: CoverArtProps) {
  const {
    seed,
    preferred,
    title,
    className = '',
    monogram = true,
    pattern = true,
    children,
    as = 'div',
    ...rest
  } = props;

  const grad = coverGradientFor(seed, preferred);
  // 仅用 title 做封面文案；缺失时给通用占位，避免把 job.id 画上去
  const label = coverLabelFrom(title);
  const tone = coverLabelTone(label);
  const motif = motifIndexFor(seed || title || 'default');
  const classes = ['pb-cover', `bg-gradient-to-br ${grad}`, className]
    .filter(Boolean)
    .join(' ');

  const layers = (
    <>
      {pattern && (
        <>
          <span className="pb-cover-mesh" aria-hidden />
          <span className={`pb-cover-motif motif-${motif}`} aria-hidden />
          <span className="pb-cover-noise" aria-hidden />
        </>
      )}
      {monogram && (
        <span
          className={[
            'pb-cover-mono',
            children ? 'is-bg' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-tone={tone}
          aria-hidden
        >
          {label}
        </span>
      )}
      <span className="pb-cover-shine" aria-hidden />
      {children != null && <span className="pb-cover-slot">{children}</span>}
    </>
  );

  if (as === 'button') {
    return (
      <button
        type="button"
        className={classes}
        data-motif={motif}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {layers}
      </button>
    );
  }

  if (as === 'span') {
    return (
      <span
        className={classes}
        data-motif={motif}
        {...(rest as HTMLAttributes<HTMLSpanElement>)}
      >
        {layers}
      </span>
    );
  }

  return (
    <div
      className={classes}
      data-motif={motif}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {layers}
    </div>
  );
}
