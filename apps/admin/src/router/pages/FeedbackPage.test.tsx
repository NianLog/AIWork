// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FeedbackPage from './FeedbackPage';

/**
 * 用户反馈页测试（批次 Q）：vi.mock api 模块，锁——类型/状态话术渲染、
 * 待处理计数、标记处理载荷（只含 id/status/remark，不带用户内容）、删除调用。
 */

const fetchFeedbacks = vi.fn();
const updateFeedback = vi.fn();
const deleteFeedback = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchFeedbacks: (...args: unknown[]) => fetchFeedbacks(...args),
    updateFeedback: (...args: unknown[]) => updateFeedback(...args),
    deleteFeedback: (...args: unknown[]) => deleteFeedback(...args),
  };
});

const ROWS = [
  {
    id: 1, appId: undefined, type: 'suggestion' as const, content: '希望支持按名称排序',
    contact: undefined, status: 0 as const, remark: undefined,
    creator: '249', createTime: '2026-09-27 10:00',
  },
  {
    id: 2, appId: 'ai-image', type: 'bug' as const, content: '导出按钮没反应',
    contact: 'dingtalk-1', status: 1 as const, remark: '已修复',
    creator: '1', createTime: '2026-09-26 09:00',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <FeedbackPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchFeedbacks.mockReset().mockResolvedValue(ROWS);
  updateFeedback.mockReset().mockResolvedValue(undefined);
  deleteFeedback.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('用户反馈页（批次 Q）', () => {
  it('列表渲染：类型与处理状态话术上屏，空关联应用显示「平台整体」，待处理计数正确', async () => {
    renderPage();
    await screen.findByText('希望支持按名称排序');

    expect(screen.getByText('平台整体')).toBeTruthy();
    expect(screen.getByText('待处理')).toBeTruthy();
    expect(screen.getByText('已处理')).toBeTruthy();
    expect(screen.getByText(/当前有 1 条待处理/)).toBeTruthy();
  });

  it('标记处理：默认已处理，载荷只含 id/status/remark', async () => {
    renderPage();
    await screen.findByText('希望支持按名称排序');

    fireEvent.click(screen.getByRole('button', { name: '标记处理' }));
    fireEvent.change(await screen.findByLabelText(/处理备注/), {
      target: { value: '已排进下个迭代' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await vi.waitFor(() => {
      expect(updateFeedback).toHaveBeenCalledWith({
        id: 1, status: 1, remark: '已排进下个迭代',
      });
    });
  });

  it('删除反馈：「···」菜单里确认后调用删除', async () => {
    renderPage();
    await screen.findByText('希望支持按名称排序');

    // 删除收在行尾「···」下拉里；两条行都有「更多操作」，取第一行（待处理那条）
    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[0]);
    fireEvent.click(await screen.findByText('删除反馈'));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await vi.waitFor(() => {
      expect(deleteFeedback).toHaveBeenCalledWith(1);
    });
  });
});
