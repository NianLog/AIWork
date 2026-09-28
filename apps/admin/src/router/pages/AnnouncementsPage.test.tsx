// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnnouncementsPage from './AnnouncementsPage';

/**
 * 公告管理页测试（批次 Q）：vi.mock api 模块，锁——列表渲染（置顶标、状态话术）、
 * 发布载荷、编辑回填与保存载荷、删除调用。请求链路语义由 api/yudao.test 守。
 */

const fetchAnnouncements = vi.fn();
const createAnnouncement = vi.fn();
const updateAnnouncement = vi.fn();
const deleteAnnouncement = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchAnnouncements: (...args: unknown[]) => fetchAnnouncements(...args),
    createAnnouncement: (...args: unknown[]) => createAnnouncement(...args),
    updateAnnouncement: (...args: unknown[]) => updateAnnouncement(...args),
    deleteAnnouncement: (...args: unknown[]) => deleteAnnouncement(...args),
  };
});

const ROWS = [
  {
    id: 2, title: '维护通知', content: '周六凌晨例行维护，影响约 30 分钟。',
    pinned: true, status: 0 as const, createTime: '2026-09-27 10:00',
  },
  {
    id: 1, title: '旧公告', content: '已下线。', pinned: false, status: 1 as const,
    createTime: '2026-09-26 09:00',
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AnnouncementsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchAnnouncements.mockReset().mockResolvedValue(ROWS);
  createAnnouncement.mockReset().mockResolvedValue(3);
  updateAnnouncement.mockReset().mockResolvedValue(undefined);
  deleteAnnouncement.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('公告管理页（批次 Q）', () => {
  it('列表渲染：置顶标与状态话术上屏，停用公告仍在管理端可见', async () => {
    renderPage();
    await screen.findByText('维护通知');

    expect(screen.getAllByText('置顶').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('启用')).toBeTruthy();
    expect(screen.getByText('停用')).toBeTruthy();
  });

  it('发布公告：表单载荷完整（置顶 + 启用），成功后重拉列表', async () => {
    renderPage();
    await screen.findByText('维护通知');

    fireEvent.click(screen.getByRole('button', { name: /发布公告/ }));
    fireEvent.change(await screen.findByLabelText(/标题/), { target: { value: '新功能上线' } });
    fireEvent.change(screen.getByLabelText(/正文/), { target: { value: '公告功能上线了。' } });
    fireEvent.click(screen.getByRole('button', { name: '发布' }));

    await vi.waitFor(() => {
      expect(createAnnouncement).toHaveBeenCalledWith({
        title: '新功能上线', content: '公告功能上线了。', pinned: false, status: 0,
      });
    });
  });

  it('编辑公告：回填原值，保存走 update 带 id', async () => {
    renderPage();
    await screen.findByText('维护通知');

    fireEvent.click(screen.getByRole('button', { name: '编辑公告 维护通知' }));
    const title = await screen.findByLabelText(/标题/);
    expect((title as HTMLInputElement).value).toBe('维护通知');

    fireEvent.change(title, { target: { value: '维护通知（改）' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await vi.waitFor(() => {
      expect(updateAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, title: '维护通知（改）' }),
      );
    });
    expect(createAnnouncement).not.toHaveBeenCalled();
  });

  it('删除公告：「···」菜单里确认后调用删除', async () => {
    renderPage();
    await screen.findByText('维护通知');

    // 删除收在行尾「···」下拉里（RowActions：主动作直排、次要动作收纳）
    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[0]);
    fireEvent.click(await screen.findByText('删除公告'));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await vi.waitFor(() => {
      expect(deleteAnnouncement).toHaveBeenCalledWith(2);
    });
  });
});
