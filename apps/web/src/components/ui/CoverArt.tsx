import {
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  readCoverImageSize,
  withCoverImageSize,
} from '../../api/client';
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
  /**
   * 目标清晰封面 URL（通常 sm/md/full）。
   * 默认会先加载 thumb，再同步加载本 URL，就绪后淡入替换。
   */
  imageUrl?: string | null;
  /** 浏览器 sizes 提示，辅助响应式选图 */
  sizes?: string;
  /**
   * 是否启用渐进加载（默认 true）：
   * 先 thumb 占位，同时拉清晰图，避免列表白屏/闪大图。
   */
  progressive?: boolean;
  /** 关键封面（首屏/播放器）优先加载预览图 */
  priority?: boolean;
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
 * 若传入 imageUrl：先出最小 thumb，再同步加载清晰图并淡入
 */
export function CoverArt(props: CoverArtProps) {
  const {
    seed,
    preferred,
    title,
    imageUrl,
    sizes,
    progressive = true,
    priority = false,
    className = '',
    monogram = true,
    pattern = true,
    children,
    as = 'div',
    ...rest
  } = props;

  const targetUrl = imageUrl || null;

  // 目标不是 thumb 时，派生最小预览 URL
  const previewUrl = useMemo(() => {
    if (!targetUrl || !progressive) return null;
    const current = readCoverImageSize(targetUrl);
    if (current === 'thumb') return null;
    return withCoverImageSize(targetUrl, 'thumb');
  }, [targetUrl, progressive]);

  const [previewReady, setPreviewReady] = useState(false);
  const [finalReady, setFinalReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [finalFailed, setFinalFailed] = useState(false);
  // 清晰图就绪后卸掉预览，释放内存
  const [dropPreview, setDropPreview] = useState(false);

  useEffect(() => {
    setPreviewReady(false);
    setFinalReady(false);
    setPreviewFailed(false);
    setFinalFailed(false);
    setDropPreview(false);
  }, [targetUrl, previewUrl]);

  useEffect(() => {
    if (!finalReady || !previewUrl) return;
    const timer = window.setTimeout(() => setDropPreview(true), 360);
    return () => window.clearTimeout(timer);
  }, [finalReady, previewUrl]);

  const showPreview =
    Boolean(previewUrl) && !previewFailed && !dropPreview;
  const showFinal = Boolean(targetUrl) && !finalFailed;
  // 真正露出像素后再隐藏渐变文案，避免加载期空洞
  const imagePainted =
    (showPreview && previewReady) || (showFinal && finalReady);
  // 预览与清晰图都失败时回落渐变底
  const imageUnavailable =
    Boolean(targetUrl) &&
    finalFailed &&
    (previewFailed || !previewUrl);

  const grad = coverGradientFor(seed, preferred);
  const label = coverLabelFrom(title);
  const tone = coverLabelTone(label);
  const motif = motifIndexFor(seed || title || 'default');
  const classes = [
    'pb-cover',
    // 有目标 URL 就切 has-image 底色，避免大图下载期间花哨渐变闪一下
    targetUrl && !imageUnavailable ? 'has-image' : `bg-gradient-to-br ${grad}`,
    imagePainted ? 'has-image-ready' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const loadingMode = priority ? 'eager' : 'lazy';

  const layers = (
    <>
      {showPreview && previewUrl && (
        <img
          className={[
            'pb-cover-image',
            'is-preview',
            previewReady ? 'is-ready' : '',
            finalReady ? 'is-fading' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          src={previewUrl}
          alt=""
          loading={loadingMode}
          decoding="async"
          fetchPriority={priority ? 'high' : undefined}
          sizes={sizes}
          draggable={false}
          onLoad={() => setPreviewReady(true)}
          onError={() => setPreviewFailed(true)}
        />
      )}
      {showFinal && targetUrl && (
        <img
          className={[
            'pb-cover-image',
            previewUrl ? 'is-final' : '',
            finalReady ? 'is-ready' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          src={targetUrl}
          alt=""
          // 与预览同步拉取清晰图（不 lazy 卡第二阶段）
          loading={previewUrl ? 'eager' : loadingMode}
          decoding="async"
          fetchPriority={priority ? 'high' : previewUrl ? 'low' : undefined}
          sizes={sizes}
          draggable={false}
          onLoad={() => setFinalReady(true)}
          onError={() => setFinalFailed(true)}
        />
      )}
      {!imagePainted && pattern && (
        <>
          <span className="pb-cover-mesh" aria-hidden />
          <span className={`pb-cover-motif motif-${motif}`} aria-hidden />
          <span className="pb-cover-noise" aria-hidden />
        </>
      )}
      {!imagePainted && monogram && (
        <span
          className={['pb-cover-mono', children ? 'is-bg' : '']
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
        data-has-image={imagePainted ? '1' : undefined}
        data-progressive={previewUrl ? '1' : undefined}
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
        data-has-image={imagePainted ? '1' : undefined}
        data-progressive={previewUrl ? '1' : undefined}
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
      data-has-image={imagePainted ? '1' : undefined}
      data-progressive={previewUrl ? '1' : undefined}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {layers}
    </div>
  );
}
