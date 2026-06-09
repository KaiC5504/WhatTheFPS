import type { ButtonHTMLAttributes } from 'react';
import { cx } from '../cx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'accent' | 'ghost' | 'subtle';
}

export function Button({ variant = 'subtle', className, type, ...rest }: ButtonProps) {
  return <button type={type ?? 'button'} className={cx('btn', `btn--${variant}`, className)} {...rest} />;
}
