import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'inset';
}

// The workhorse solid surface. Everything that holds data is a Card, never glass.
export function Card({ tone = 'default', className, ...rest }: CardProps) {
  return <div className={cx('card', tone === 'inset' && 'card--inset', className)} {...rest} />;
}
