import {
  PROJECT_LOGO_URL,
  PROJECT_NAME,
} from '../lib/project';

type BrandMarkProps = {
  /** 显示尺寸（px） */
  size?: number;
  className?: string;
  /** 是否展示为圆角应用图标样式容器 */
  framed?: boolean;
  alt?: string;
};

/**
 * 全局品牌 Logo / IP 形象
 * 资源：apps/web/public/logo.webp（同源 docs/img/logo.webp）
 */
export function BrandMark({
  size = 32,
  className = '',
  framed = true,
  alt = PROJECT_NAME,
}: BrandMarkProps) {
  if (!framed) {
    return (
      <img
        className={['brand-logo', className].filter(Boolean).join(' ')}
        src={PROJECT_LOGO_URL}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
      />
    );
  }

  return (
    <span
      className={['brand-mark', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      aria-hidden={alt ? undefined : true}
    >
      <img
        className="brand-mark-img"
        src={PROJECT_LOGO_URL}
        alt={alt}
        width={size}
        height={size}
        draggable={false}
      />
    </span>
  );
}

/** 较大的 IP 形象展示（登录 / 初始化等） */
export function BrandMascot({
  size = 88,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={['brand-mascot', className].filter(Boolean).join(' ')}
      src={PROJECT_LOGO_URL}
      alt={PROJECT_NAME}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
