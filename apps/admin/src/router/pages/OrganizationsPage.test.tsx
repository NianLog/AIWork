// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OrganizationsPage from './OrganizationsPage';

/**
 * 组织页真实化测试（批次 H Step 5）：vi.mock api 模块函数，锁——
 * 上级组织本地映射与联系方式缺省、新增组织载荷（TreeSelect 选上级）、
 * 编辑时子树排除防环、删除调用。
 * 请求链路语义（信封/401/刷新）由 api/yudao.test 与 App.test 各守一份。
 */

const fetchDepts = vi.fn();
const createDept = vi.fn();
const updateDept = vi.fn();
const deleteDept = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchDepts: (...args: unknown[]) => fetchDepts(...args),
    createDept: (...args: unknown[]) => createDept(...args),
    updateDept: (...args: unknown[]) => updateDept(...args),
    deleteDept: (...args: unknown[]) => deleteDept(...args),
  };
});

const DEPTS = [
  {
    id: 100, parentId: 0, name: '深圳总公司', sort: 0, leaderUserId: null,
    phone: '', email: 'hq@example.invalid', status: 0 as const, createTime: 0,
  },
  {
    id: 103, parentId: 100, name: '研发部门', sort: 1, leaderUserId: null,
    phone: '0755-1000', email: '', status: 0 as const, createTime: 0,
  },
  {
    id: 106, parentId: 100, name: '市场部门', sort: 2, leaderUserId: null,
    phone: '', email: '', status: 1 as const, createTime: 0,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <OrganizationsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchDepts.mockReset().mockResolvedValue(DEPTS);
  createDept.mockReset().mockResolvedValue(200);
  updateDept.mockReset().mockResolvedValue(undefined);
  deleteDept.mockReset().mockResolvedValue(undefined);
});

// 本项目 vitest 未开 globals：显式清理残留 DOM
afterEach(cleanup);

describe('组织页真实化（批次 H Step 5）', () => {
  it('列表渲染：上级组织映射、联系方式三态缺省、演示列已删', async () => {
    renderPage();
    // 名称出现 3 次 = 组织列 1 次 + 两行子部门的「上级组织」映射 2 次（锁映射语义）
    await waitFor(() => expect(screen.getAllByText('深圳总公司').length).toBe(3));

    // 联系方式：邮箱优先 → 电话 → 「—」；顶级组织上级显示「—」
    expect(screen.getByText('hq@example.invalid')).toBeTruthy();
    expect(screen.getByText('0755-1000')).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('停用')).toBeTruthy();
    // 批次 H 砍掉的演示列
    expect(screen.queryByText('成员数')).toBeNull();
    expect(screen.queryByText('可用应用数')).toBeNull();
  });

  it('新增组织：TreeSelect 选上级后提交创建载荷', async () => {
    renderPage();
    // 名称出现 3 次 = 组织列 1 次 + 两行子部门的「上级组织」映射 2 次（锁映射语义）
    await waitFor(() => expect(screen.getAllByText('深圳总公司').length).toBe(3));

    fireEvent.click(screen.getByRole('button', { name: /新增组织/ }));
    fireEvent.change(await screen.findByLabelText(/组织名/), { target: { value: '巡检组' } });
    // 上级组织 TreeSelect：同为 rc-select 系触发器，对 .dtd-select-selector 打 mousedown
    const selector = screen.getByLabelText(/上级组织/).closest('.dtd-select-selector') as HTMLElement;
    fireEvent.mouseDown(selector);
    const option = await waitFor(() => {
      const hit = Array.from(
        document.querySelectorAll('.dtd-select-tree-node-content-wrapper, .dtd-tree-select-node-content-wrapper'),
      ).find((node) => node.textContent === '研发部门');
      if (!hit) throw new Error('上级组织选项尚未渲染');
      return hit;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: '创建组织' }));

    await waitFor(() =>
      expect(createDept).toHaveBeenCalledWith(
        // status 显式传 0：SaveReqVO @NotNull，缺省 400「状态不能为空」（e2e 实证锁死）
        expect.objectContaining({ name: '巡检组', parentId: 103, sort: 0, status: 0 }),
      ),
    );
    // 刷新动线 = 页面挂载 + 对话框开（拉上级组织树）+ 保存后 reload，共 3 次
    await waitFor(() => expect(fetchDepts).toHaveBeenCalledTimes(3));
  });

  it('编辑组织：树里排除自己与后代（防环），保存走整行更新', async () => {
    renderPage();
    // 名称出现 3 次 = 组织列 1 次 + 两行子部门的「上级组织」映射 2 次（锁映射语义）
    await waitFor(() => expect(screen.getAllByText('深圳总公司').length).toBe(3));

    // 第一行是顶级「深圳总公司」：编辑是行内主操作（带行名 aria-label，不撞同名）
    fireEvent.click(screen.getByRole('button', { name: '编辑 深圳总公司' }));

    const nameInput = await screen.findByLabelText(/组织名/);
    // 本仓库未挂 jest-dom matcher：值断言走原生 .value
    expect((nameInput as HTMLInputElement).value).toBe('深圳总公司');
    const selector = screen.getByLabelText(/上级组织/).closest('.dtd-select-selector') as HTMLElement;
    fireEvent.mouseDown(selector);
    await waitFor(() => {
      // 弹层树已展开：只有「作为顶级组织」可选，子孙（研发/市场部门）不出现
      const options = Array.from(
        document.querySelectorAll('.dtd-select-tree-node-content-wrapper, .dtd-tree-select-node-content-wrapper'),
      );
      if (options.length === 0) throw new Error('上级组织选项尚未渲染');
      expect(options.some((node) => node.textContent === '研发部门')).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(updateDept).toHaveBeenCalledTimes(1));
    expect(updateDept.mock.calls[0][0].id).toBe(100);
    expect(updateDept.mock.calls[0][1]).toEqual(
      expect.objectContaining({ name: '深圳总公司', parentId: 0 }),
    );
  });

  it('删除组织：确认后调用删除端点并刷新', async () => {
    renderPage();
    // 名称出现 3 次 = 组织列 1 次 + 两行子部门的「上级组织」映射 2 次（锁映射语义）
    await waitFor(() => expect(screen.getAllByText('深圳总公司').length).toBe(3));

    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[2]);
    fireEvent.click(await screen.findByText('删除组织'));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(deleteDept).toHaveBeenCalledWith(106));
    await waitFor(() => expect(fetchDepts).toHaveBeenCalledTimes(2));
  });
});
