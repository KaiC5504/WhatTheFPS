import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

// The ONLY frosted surface in the app (hero + modals). Keep dense data off of it.
export function GlassCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('glass-card', className)} {...rest} />;
}
