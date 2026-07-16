import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
}) {
  const map: Record<Variant, string> = {
    primary: 'nl-btn nl-btn-primary',
    secondary: 'nl-btn nl-btn-secondary',
    ghost: 'nl-btn nl-btn-ghost',
    danger: 'nl-btn nl-btn-danger',
  };
  return (
    <button type="button" className={`${map[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
