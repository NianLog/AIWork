// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RoadmapPage from './RoadmapPage';

/**
 * 功能进展页测试（批次 R）：vi.mock api 模块，锁——列表渲染（阶段话术、进度、
 * 未排期）、新增载荷（阶段数值化）、编辑回填带 id、删除调用。请求链路语义由
 * api/yudao.test 守；进度条与门户工期计算是展示层事实，由门户测试守。
 */

const fetchRoadmapItems = vi.fn();
const createRoadmapItem = vi.fn();
const updateRoadmapItem = vi.fn();
const deleteRoadmapItem = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchRoadmapItems: (...args: unknown[]) => fetchRoadmapItems(...args),
    createRoadmapItem: (...args: unknown[]) => createRoadmapItem(...args),
    updateRoadmapItem: (...args: unknown[]) => updateRoadmapItem(...args),
    deleteRoadmapItem: (...args: unknown[]) => deleteRoadmapItem(...args),
  };
});

const ROWS = [
  {
    id: 1, name: '统一登录', description: '账号密码登录与会话保持',
    stage: 2 as const, progress: 100, startDate: '2026-09-20', dueDate: '2026-09-25', sort: 1,
  },
  {
    id: 2, name: '使用统计', description: undefined,
    stage: 1 as const, progress: 40, startDate: undefined, dueDate: undefined, sort: 2,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <RoadmapPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchRoadmapItems.mockReset().mockResolvedValue(ROWS);
  createRoadmapItem.mockReset().mockResolvedValue(3);
  updateRoadmapItem.mockReset().mockResolvedValue(undefined);
  deleteRoadmapItem.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('功能进展页（批次 R）', () => {
  it('列表渲染：阶段话术、进度值与未排期文案上屏，统计行计数', async () => {
    renderPage();
    await screen.findByText('统一登录');

    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('进行中')).toBeTruthy();
    // dtd Progress 把百分数文本拆在多层元素里，用全文断言；
    // percent=100 自动转 success 态渲染对勾而非数字（antd 惯例），只断言进行中的 40%
    expect(document.body.textContent).toContain('40%');
    expect(screen.getByText('未排期')).toBeTruthy();
    expect(screen.getByText(/已完成 1 · 进行中 1 · 规划中 0/)).toBeTruthy();
  });

  it('新增条目：填名称选阶段，创建载荷完整（阶段数值化、空日期不上行）', async () => {
    renderPage();
    await screen.findByText('统一登录');

    fireEvent.click(screen.getByRole('button', { name: /新增条目/ }));
    fireEvent.change(await screen.findByLabelText(/名称/), { target: { value: '消息提醒' } });
    fireEvent.change(screen.getByLabelText(/说明/), { target: { value: '多通道提醒' } });
    fireEvent.click(screen.getByRole('radio', { name: '进行中' }));
    fireEvent.click(screen.getByRole('button', { name: '创建' }));

    await vi.waitFor(() => {
      expect(createRoadmapItem).toHaveBeenCalledWith({
        id: undefined,
        name: '消息提醒',
        description: '多通道提醒',
        stage: 1,
        progress: 0,
        startDate: undefined,
        dueDate: undefined,
        sort: 0,
      });
    });
  });

  it('编辑条目：回填原值（含日期），保存走 update 带 id', async () => {
    renderPage();
    await screen.findByText('统一登录');

    fireEvent.click(screen.getByRole('button', { name: '编辑条目 统一登录' }));
    const name = await screen.findByLabelText(/名称/);
    expect((name as HTMLInputElement).value).toBe('统一登录');
    const start = screen.getByLabelText(/开始日期/);
    expect((start as HTMLInputElement).value).toBe('2026-09-20');

    fireEvent.change(name, { target: { value: '统一登录（改）' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await vi.waitFor(() => {
      expect(updateRoadmapItem).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, name: '统一登录（改）', stage: 2, progress: 100 }),
      );
    });
    expect(createRoadmapItem).not.toHaveBeenCalled();
  });

  it('删除条目：「···」菜单里确认后调用删除', async () => {
    renderPage();
    await screen.findByText('统一登录');

    // 删除收在行尾「···」下拉里（RowActions：主动作直排、次要动作收纳）
    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[0]);
    fireEvent.click(await screen.findByText('删除条目'));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await vi.waitFor(() => {
      expect(deleteRoadmapItem).toHaveBeenCalledWith(1);
    });
  });
});
