// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ApplicationsPage from './ApplicationsPage';

/**
 * 版本与回滚弹窗测试（批次 I Step 5）：vi.mock api 模块 + RowActions
 * （纯展示收纳组件，mock 平铺所有动作直测页面状态机）。锁三件事——
 * 弹窗打开即拉版本目录、回滚二次确认的指针载荷 {version, latestVersion}、
 * 当前展示版本禁用回滚。
 */

const fetchApplications = vi.fn();
const fetchAppVersions = vi.fn();
const updateApplication = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchApplications: (...args: unknown[]) => fetchApplications(...args),
    fetchAppVersions: (...args: unknown[]) => fetchAppVersions(...args),
    updateApplication: (...args: unknown[]) => updateApplication(...args),
  };
});

vi.mock('../parts/RowActions', () => ({
  default: ({
    actions,
  }: {
    actions: Array<{ key: string; label: string; onClick: () => void }>;
  }) => (
    <div>
      {actions.map((action) => (
        <button key={action.key} type="button" onClick={action.onClick}>
          {action.label}
        </button>
      ))}
    </div>
  ),
}));

const APP_ROW = {
  id: 1, appId: 'demo-vue', name: '示例应用', version: '2.0.0', framework: 'vue3',
  sandbox: 'iframe', baseRoute: '/demo-vue', entry: '/subapps/demo-vue/',
  backendApi: 'http://x/admin-api', icon: undefined, latestVersion: '2.0.0',
  canaryVersion: undefined, canaryRatio: 0, status: 0 as const, audit: 0,
  channel: 'stable' as const, publishedAt: '2026-09-27 10:00',
};

const VERSIONS = [
  { version: '2.0.0', buildTime: '2026-09-27T18:00:00', uploader: '联调管理员',
    sha256: 'a'.repeat(64), isLatest: true, isCanary: false, isDisplay: true },
  { version: '1.0.0', buildTime: '2026-09-26T10:00:00', uploader: '联调管理员',
    sha256: 'b'.repeat(64), isLatest: false, isCanary: false, isDisplay: false },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <ApplicationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchApplications.mockReset().mockResolvedValue([APP_ROW]);
  fetchAppVersions.mockReset().mockResolvedValue(VERSIONS);
  updateApplication.mockReset().mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('版本与回滚（批次 I Step 5）', () => {
  it('打开弹窗即拉版本目录，渲染指针徽标；当前展示行禁用回滚', async () => {
    renderPage();
    await screen.findByText('示例应用');

    fireEvent.click(screen.getByRole('button', { name: '版本与回滚' }));

    await waitFor(() => expect(fetchAppVersions).toHaveBeenCalledWith('demo-vue'));
    expect(await screen.findByText('1.0.0')).toBeTruthy();
    expect(screen.getByText('当前展示')).toBeTruthy();
    expect(screen.getByText('稳定最新')).toBeTruthy();
    // 2.0.0 是当前展示版：回滚按钮禁用；1.0.0 可点
    const buttons = screen.getAllByRole('button', { name: '回滚到此版' });
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('回滚二次确认后指针载荷 {version, latestVersion}，并刷新版本列表', async () => {
    renderPage();
    await screen.findByText('示例应用');
    fireEvent.click(screen.getByRole('button', { name: '版本与回滚' }));
    await screen.findByText('1.0.0');

    fireEvent.click(screen.getAllByRole('button', { name: '回滚到此版' })[1]);
    fireEvent.click(await screen.findByRole('button', { name: /回滚到 1\.0\.0/ }));

    await waitFor(() => expect(updateApplication).toHaveBeenCalledTimes(1));
    const [row, patch] = updateApplication.mock.calls[0];
    expect(row).toMatchObject({ id: 1, appId: 'demo-vue' });
    expect(patch).toEqual({ version: '1.0.0', latestVersion: '1.0.0' });
    // 回滚成功后重新拉版本目录（指针徽标随 sys_app 更新而变）
    await waitFor(() => expect(fetchAppVersions).toHaveBeenCalledTimes(2));
  });
});
