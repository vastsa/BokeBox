type Props = {
  label: string;
  /** 淡出中（保留一帧做退场） */
  fading?: boolean;
  className?: string;
};

/**
 * 星图页加载态：CSS 宇宙动画，覆盖懒加载 / 数据 / WebGL 首帧黑屏。
 */
export function StarMapLoader({ label, fading = false, className }: Props) {
  return (
    <div
      className={['tc-loader', fading ? 'is-fading' : '', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy={!fading}
    >
      <div className="tc-loader-sky" aria-hidden>
        <span className="tc-loader-glow" />
        <span className="tc-loader-orbit tc-loader-orbit--outer" />
        <span className="tc-loader-orbit tc-loader-orbit--mid" />
        <span className="tc-loader-orbit tc-loader-orbit--inner" />
        <span className="tc-loader-core">
          <span className="tc-loader-core-star" />
        </span>
        <span className="tc-loader-spark s1" />
        <span className="tc-loader-spark s2" />
        <span className="tc-loader-spark s3" />
        <span className="tc-loader-spark s4" />
        <span className="tc-loader-spark s5" />
        <span className="tc-loader-spark s6" />
      </div>
      <p className="tc-loader-text">{label}</p>
      <span className="tc-loader-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}
