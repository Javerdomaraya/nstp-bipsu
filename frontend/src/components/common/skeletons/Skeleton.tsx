import React from 'react';

export type SkeletonProps = React.ComponentProps<'div'> & {
  shimmer?: boolean;
};

export default function Skeleton({
  className = '',
  shimmer = true,
  ...props
}: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={`rounded-md bg-slate-200/80 dark:bg-slate-800/80 motion-reduce:animate-none ${
        shimmer ? 'animate-shimmer animate-pulse' : 'animate-pulse'
      } ${className}`}
      {...props}
    />
  );
}

export { Skeleton };
