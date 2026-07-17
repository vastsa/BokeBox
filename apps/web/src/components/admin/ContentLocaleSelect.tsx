import {
  CONTENT_LOCALES,
  LOCALE_META,
  type Locale,
} from '../../i18n';

type Props = {
  value: Locale | string;
  onChange: (next: Locale) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** 服务端下发的列表优先，缺省用本地注册表 */
  options?: Array<{ code: string; nativeLabel: string; label: string; short?: string }>;
  'aria-label'?: string;
};

/**
 * 内容语言选择：基于注册中心，新增语言无需改组件
 */
export function ContentLocaleSelect({
  value,
  onChange,
  disabled,
  id,
  className,
  options,
  'aria-label': ariaLabel,
}: Props) {
  const list =
    options && options.length > 0
      ? options
      : CONTENT_LOCALES.map((code) => ({
          code,
          nativeLabel: LOCALE_META[code].nativeLabel,
          label: LOCALE_META[code].label,
          short: LOCALE_META[code].short,
        }));

  return (
    <select
      id={id}
      className={className || 'jd-select'}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value as Locale)}
    >
      {list.map((item) => (
        <option key={item.code} value={item.code}>
          {item.nativeLabel}
          {item.label && item.label !== item.nativeLabel ? ` · ${item.label}` : ''}
        </option>
      ))}
    </select>
  );
}

export function contentLocaleLabel(code?: string | null): string {
  if (!code) return LOCALE_META['zh-CN'].nativeLabel;
  const meta = (LOCALE_META as Record<string, { nativeLabel: string; label: string }>)[code];
  return meta?.nativeLabel || meta?.label || code;
}
