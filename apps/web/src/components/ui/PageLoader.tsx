import { BrandMark } from '../BrandMark';
import { PROJECT_NAME } from '../../lib/project';

type PageLoaderProps = {
  /** 加载文案 */
  label: string;
  /**
   * screen：全屏鉴权/启动态（自带 auth-screen 外壳）
   * block：设置面板等局部加载
   */
  variant?: 'screen' | 'block';
  className?: string;
  /** 是否展示品牌标（默认 true） */
  showBrand?: boolean;
};

/**
 * 全局页面加载态：品牌标 + 轨道光环 + 文案点点。
 * 覆盖启动门禁、登录检查、设置加载等场景。
 */
export function PageLoader({
  label,
  variant = 'screen',
  className = '',
  showBrand = true,
}: PageLoaderProps) {
  const body = (
    <div
      className={[
        'pb-loader',
        `pb-loader--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <div className="pb-loader-visual" aria-hidden>
        <span className="pb-loader-orbit pb-loader-orbit--outer" />
        <span className="pb-loader-orbit pb-loader-orbit--mid" />
        <span className="pb-loader-orbit pb-loader-orbit--inner" />
        <span className="pb-loader-core">
          {showBrand ? (
            <BrandMark
              size={variant === 'block' ? 28 : 36}
              framed={false}
              alt=""
            />
          ) : (
            <span className="pb-loader-dot-core" />
          )}
        </span>
        <span className="pb-loader-spark s1" />
        <span className="pb-loader-spark s2" />
        <span className="pb-loader-spark s3" />
      </div>

      <div className="pb-loader-copy">
        <p className="pb-loader-label">{label}</p>
        <span className="pb-loader-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>

      {variant === 'screen' && (
        <span className="pb-loader-brand-name" aria-hidden>
          {PROJECT_NAME}
        </span>
      )}
    </div>
  );

  if (variant === 'screen') {
    return (
      <div className="auth-screen pb-loader-screen">
        <div className="auth-card pb-loader-card nl-enter">{body}</div>
      </div>
    );
  }

  return body;
}
