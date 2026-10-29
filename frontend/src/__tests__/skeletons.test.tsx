import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Skeleton,
  PageHeaderSkeleton,
  StatCardSkeleton,
  StatsGridSkeleton,
  TableSkeleton,
  ListSkeleton,
  ProfileSectionSkeleton,
  AppShellSkeleton,
} from '../components/common/skeletons';

describe('Skeleton components library', () => {
  it('renders base Skeleton with accessible attributes and animation classes', () => {
    const html = renderToStaticMarkup(<Skeleton className="h-6 w-24" />);
    expect(html).toContain('data-slot="skeleton"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('animate-pulse');
    expect(html).toContain('animate-shimmer');
    expect(html).toContain('motion-reduce:animate-none');
    expect(html).toContain('h-6 w-24');
  });

  it('renders StatCardSkeleton matching StatCard dimensions', () => {
    const html = renderToStaticMarkup(<StatCardSkeleton hasProgress hasDetail />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('rounded-2xl');
    expect(html).toContain('min-h-[6.75rem]');
    expect(html).toContain('border-slate-200');
  });

  it('renders StatsGridSkeleton with configurable card count', () => {
    const html = renderToStaticMarkup(<StatsGridSkeleton count={3} />);
    expect(html).toContain('grid');
    expect(html).toContain('grid-cols-1');
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('lg:grid-cols-4');
  });

  it('renders PageHeaderSkeleton with title and search placeholders', () => {
    const html = renderToStaticMarkup(<PageHeaderSkeleton hasEyebrow hasSubtitle hasSearch hasActions />);
    expect(html).toContain('header');
    expect(html).toContain('sticky top-0');
    expect(html).toContain('backdrop-blur-md');
  });

  it('renders TableSkeleton with responsive desktop and mobile layouts', () => {
    const html = renderToStaticMarkup(<TableSkeleton columns={4} rows={3} />);
    expect(html).toContain('hidden md:block');
    expect(html).toContain('md:hidden');
    expect(html).toContain('table');
    expect(html).toContain('tbody');
  });

  it('renders ListSkeleton with multiple card rows', () => {
    const html = renderToStaticMarkup(<ListSkeleton count={4} />);
    expect(html).toContain('space-y-3');
    expect(html).toContain('rounded-2xl');
  });

  it('renders ProfileSectionSkeleton with avatar and text placeholders', () => {
    const html = renderToStaticMarkup(<ProfileSectionSkeleton />);
    expect(html).toContain('rounded-2xl');
  });

  it('renders AppShellSkeleton mimicking the full application shell layout', () => {
    const html = renderToStaticMarkup(<AppShellSkeleton />);
    expect(html).toContain('aside');
    expect(html).toContain('main');
    expect(html).toContain('bg-[#061f4f]');
  });
});
