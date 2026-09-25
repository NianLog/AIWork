// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

/**
 * 应用市场的加载态（2026-09-25 批次二）：演示数据永远 success，
 * loading 形状只能靠 mock 注入——这里单独一个文件，避免把 App.test.tsx
 * 里的其余用例也拖进 mock 环境。
 *
 * 锁三条性质：
 * 1. 加载时有骨架（彩虹规范允许的加载装饰位），页面不塌形；
 * 2. 骨架是纯装饰（aria-hidden），读屏只听到「应用列表加载中」的 region；
 * 3. 加载期间不播报结果数（没有可播报的数），也不出现表格/卡片数据。
 */
vi.mock('./store/demoCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./store/demoCatalog')>();
  return {
    ...actual,
    DEMO_APPS_VIEW: { status: 'loading' as const, data: actual.DEMO_APPS },
  };
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('应用市场加载态', () => {
  it('加载中渲染骨架而非数据，且骨架不进无障碍树', () => {
    window.history.replaceState(null, '', '/preview/market');
    render(<App />);

    const region = screen.getByRole('region', { name: '应用列表加载中' });
    expect(region.querySelectorAll('.ui-skeleton').length).toBeGreaterThan(0);

    // 骨架列表是装饰（aria-hidden）；region 本身带标签，读屏听到的是「应用列表加载中」
    expect(region.querySelector('ul')?.getAttribute('aria-hidden')).toBe('true');

    // 没有可播报的数：加载中不出现「找到 N 个应用」
    expect(screen.queryByText(/找到 \d+ 个应用/)).toBeNull();

    // 数据不该在加载态里露出来（骨架里没有应用名）
    expect(screen.queryByText('AI 商品图生成')).toBeNull();
  });
});
