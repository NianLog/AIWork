// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PublishPage from './PublishPage';

/**
 * 发布页真实表单测试（批次 H Step 2）：vi.mock api 模块函数，锁三件事——
 * 新建/编辑的载荷形态（含试运行字段联动与清零）、必填校验点名、成功后回应用列表。
 * 请求链路本身（信封/401/刷新）由 api/yudao.test 与 App.test 的全局 fetch stub 各守一份，
 * 这里不重复（双 mock 模式刻意并存）。
 */

const createApplication = vi.fn();
const updateApplication = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    createApplication: (...args: unknown[]) => createApplication(...args),
    updateApplication: (...args: unknown[]) => updateApplication(...args),
  };
});

const EDIT_ROW = {
  id: 2, appId: 'video-studio', name: '视频工坊', entry: '/subapps/video-studio/',
  backendApi: 'http://x/admin-api', baseRoute: '/video', icon: undefined, version: '1.2.0',
  framework: 'vue3', sandbox: 'iframe', latestVersion: undefined, canaryVersion: '1.3.0-rc.1',
  canaryRatio: 20, status: 0 as const, audit: 0, channel: 'canary' as const,
  publishedAt: '2026-09-27 10:00',
};

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={state ? [{ pathname: '/preview/publish', state }] : ['/preview/publish']}
    >
      <Routes>
        <Route path="/preview/publish" element={<PublishPage />} />
        <Route path="/preview/apps" element={<div>apps-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillRequired(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    应用名称: '图像工坊二',
    应用标识: 'image-studio-2',
    版本号: '0.1.0',
    访问入口: '/subapps/image-studio-2/',
    后端服务地址: 'http://jbslab.bili:48080/admin-api',
    路由前缀: '/image-studio-2',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    // 「应用标识」等标签内嵌提示 span，可访问名是整段文本：正则匹配
    fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
  }
}

beforeEach(() => {
  createApplication.mockReset().mockResolvedValue(9);
  updateApplication.mockReset().mockResolvedValue(undefined);
});

// 本项目 vitest 未开 globals：RTL 不会自动清理，残留 DOM 会让后续用例
// 「查到多个同名元素」——照 App.test 的模式显式清理。
afterEach(cleanup);

describe('发布页真实表单（批次 H）', () => {
  it('新建：必填齐全提交 createApplication，成功后回应用列表', async () => {
    renderPage();
    const form = await screen.findByRole('form', { name: '应用发布' });
    fillRequired();
    fireEvent.submit(form);

    await waitFor(() => expect(screen.getByText('apps-page')).toBeTruthy());
    expect(createApplication).toHaveBeenCalledTimes(1);
    expect(createApplication.mock.calls[0][0]).toMatchObject({
      appId: 'image-studio-2',
      name: '图像工坊二',
      version: '0.1.0',
      entry: '/subapps/image-studio-2/',
      backendApi: 'http://jbslab.bili:48080/admin-api',
      baseRoute: '/image-studio-2',
      framework: 'react',
      sandbox: 'iframe',
      status: 0,
    });
    // 正式发布不带试运行字段
    expect(createApplication.mock.calls[0][0]).not.toHaveProperty('canaryVersion');
    expect(updateApplication).not.toHaveBeenCalled();
  });

  it('新建：缺必填时点名提示，不发起请求', async () => {
    renderPage();
    await screen.findByRole('form', { name: '应用发布' });
    fireEvent.change(screen.getByLabelText('应用名称'), { target: { value: '只有名字' } });
    fireEvent.submit(screen.getByRole('form', { name: '应用发布' }));

    await waitFor(() => expect(screen.getByText(/请先填写：/)).toBeTruthy());
    expect(screen.getByText(/请先填写：/).textContent).toContain('应用标识');
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('试运行模式：切换后携带试运行版本与比例', async () => {
    renderPage();
    await screen.findByRole('form', { name: '应用发布' });
    fillRequired();
    fireEvent.click(document.querySelector('input[value="canary"]') as HTMLInputElement);
    fireEvent.change(await screen.findByLabelText('试运行版本'), { target: { value: '0.2.0-rc.1' } });
    fireEvent.submit(screen.getByRole('form', { name: '应用发布' }));

    await waitFor(() => expect(screen.getByText('apps-page')).toBeTruthy());
    expect(createApplication.mock.calls[0][0]).toMatchObject({
      canaryVersion: '0.2.0-rc.1',
      canaryRatio: 10,
    });
  });

  it('编辑模式：整行预填（标识禁改），保存走 updateApplication', async () => {
    renderPage({ app: EDIT_ROW });
    await screen.findByRole('form', { name: '应用发布' });

    expect((screen.getByLabelText('应用名称') as HTMLInputElement).value).toBe('视频工坊');
    expect((screen.getByLabelText(/应用标识/) as HTMLInputElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('应用名称'), { target: { value: '视频工坊-改名' } });
    fireEvent.submit(screen.getByRole('form', { name: '应用发布' }));

    await waitFor(() => expect(screen.getByText('apps-page')).toBeTruthy());
    expect(updateApplication).toHaveBeenCalledTimes(1);
    const [row, patch] = updateApplication.mock.calls[0];
    expect(row).toMatchObject({ id: 2, appId: 'video-studio' });
    expect(patch).toMatchObject({ name: '视频工坊-改名', framework: 'vue3', canaryVersion: '1.3.0-rc.1', canaryRatio: 20 });
    expect(createApplication).not.toHaveBeenCalled();
  });
});
