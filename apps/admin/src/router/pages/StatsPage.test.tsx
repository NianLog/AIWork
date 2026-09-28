// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatsPage from './StatsPage';

/**
 * 使用统计页测试（批次 T）：vi.mock api 模块，锁——趋势渲染（合计/峰值话术、
 * 14 根柱、柱值与日期可达）、按应用排行（名称/次数/占比）、空态文案、错误态
 * 重试。柱高归一与 CSS 是展示层事实，快照不锁样式。
 */

const fetchAccessStats = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchAccessStats: (...args: unknown[]) => fetchAccessStats(...args),
  };
});

function dailyOf(counts: number[]) {
  // 2026-09 是真实历月，日期与柱值对得上（末位=当天）
  return counts.map((count, index) => ({ date: `2026-09-${String(index + 15).padStart(2, '0')}`, count }));
}

const STATS = {
  daily: dailyOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 5]),
  byApp: [
    { appId: 'demo-vue', name: '演示应用', count: 5 },
    { appId: 'ai-video', name: '视频工坊', count: 3 },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchAccessStats.mockReset();
});

afterEach(cleanup);

describe('使用统计页（批次 T）', () => {
  it('趋势与排行渲染：合计峰值上屏，14 根柱、柱值与占比可读', async () => {
    fetchAccessStats.mockResolvedValue(STATS);
    renderPage();

    expect(await screen.findByText('合计 8 次')).toBeTruthy();
    expect(screen.getByRole('img', { name: '近 14 天共 8 次访问，单日峰值 5 次' })).toBeTruthy();
    // 14 天补零恒连续，每根柱都有可达的悬浮值
    expect(document.querySelectorAll('.stats-bars__bar')).toHaveLength(14);
    expect(screen.getByTitle('2026-09-28：5 次')).toBeTruthy();
    expect(screen.getByText('演示应用')).toBeTruthy();
    // 占比按合计取整：5/8=62.5%→63%
    expect(screen.getByText('63%')).toBeTruthy();
    expect(fetchAccessStats).toHaveBeenCalledWith(14);
  });

  it('空数据：不出图不出排行行，给「从今天开始积累」的人话空态', async () => {
    fetchAccessStats.mockResolvedValue({ daily: dailyOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), byApp: [] });
    renderPage();

    expect(await screen.findByText('合计 0 次')).toBeTruthy();
    expect(
      screen.getByText('还没有访问记录。成员从门户打开子应用后，这里就会出现第一根柱子。'),
    ).toBeTruthy();
    expect(document.querySelector('.stats-bars')).toBeNull();
    expect(screen.getByText('还没有访问记录。')).toBeTruthy();
  });

  it('加载失败：错误态给重试，重试重新拉取', async () => {
    fetchAccessStats.mockRejectedValueOnce(new Error('网络抖了'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    // 先备好第二次的成功响应再点重试（fetcher 在点击瞬间就会发起请求）
    fetchAccessStats.mockResolvedValue(STATS);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('合计 8 次')).toBeTruthy();
    expect(fetchAccessStats).toHaveBeenCalledTimes(2);
  });
});
