// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RolesPage from './RolesPage';

/**
 * 角色页真实化测试（批次 H Step 4）：vi.mock api 模块函数，锁——
 * 数据范围人话映射、新增角色载荷、菜单树勾选的父节点合并口径（计划风险 2）、删除调用。
 * 请求链路语义（信封/401/刷新）由 api/yudao.test 与 App.test 各守一份。
 */

const fetchRoles = vi.fn();
const fetchApplications = vi.fn();
const fetchAppPermissions = vi.fn();
const fetchMenus = vi.fn();
const fetchRoleMenus = vi.fn();
const createRole = vi.fn();
const updateRole = vi.fn();
const deleteRole = vi.fn();
const assignRoleMenus = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchRoles: (...args: unknown[]) => fetchRoles(...args),
    fetchApplications: (...args: unknown[]) => fetchApplications(...args),
    fetchAppPermissions: (...args: unknown[]) => fetchAppPermissions(...args),
    fetchMenus: (...args: unknown[]) => fetchMenus(...args),
    fetchRoleMenus: (...args: unknown[]) => fetchRoleMenus(...args),
    createRole: (...args: unknown[]) => createRole(...args),
    updateRole: (...args: unknown[]) => updateRole(...args),
    deleteRole: (...args: unknown[]) => deleteRole(...args),
    assignRoleMenus: (...args: unknown[]) => assignRoleMenus(...args),
  };
});

const ROLES = [
  {
    id: 1, name: '超级管理员', code: 'super_admin', sort: 1, status: 0 as const,
    type: 1, dataScope: 1, remark: '', createTime: 0,
  },
  {
    id: 2, name: '巡检管理员', code: 'patrol_admin', sort: 2, status: 0 as const,
    type: 2, dataScope: 4, remark: '负责巡检应用的管理', createTime: 0,
  },
];

const APPS = [
  {
    id: 5, appId: 'demo-vue', name: '示例应用', version: '1.0.0', framework: 'vue3',
    sandbox: 'iframe', baseRoute: '/demo', entry: 'https://apps.invalid/demo/index.html',
    backendApi: '', icon: '', latestVersion: '1.0.0', canaryVersion: '', canaryRatio: 0,
    status: 0 as const, createTime: 0,
  },
];

const PERMISSIONS = [
  { id: 71, appId: 'demo-vue', code: 'task:create', name: '新建任务', description: '', module: '', createTime: 0 },
  { id: 72, appId: 'demo-vue', code: 'task:delete', name: '删除任务', description: '', module: '', createTime: 0 },
];

/** 菜单树：目录(1) → 菜单(2) → 按钮(3)×2；202 未授权是勾选用例的关键缺口。 */
const MENUS = [
  { id: 1, parentId: 0, name: '示例应用目录', type: 1 as const, permission: '', status: 0 as const, sort: 1 },
  { id: 2, parentId: 1, name: '任务管理', type: 2 as const, permission: '', status: 0 as const, sort: 1 },
  { id: 201, parentId: 2, name: '新建任务', type: 3 as const, permission: 'task:create', status: 0 as const, sort: 1 },
  { id: 202, parentId: 2, name: '删除任务', type: 3 as const, permission: 'task:delete', status: 0 as const, sort: 2 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <RolesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchRoles.mockReset().mockResolvedValue(ROLES);
  fetchApplications.mockReset().mockResolvedValue(APPS);
  fetchAppPermissions.mockReset().mockResolvedValue(PERMISSIONS);
  fetchMenus.mockReset().mockResolvedValue(MENUS);
  fetchRoleMenus.mockReset().mockResolvedValue([1, 2, 201]);
  createRole.mockReset().mockResolvedValue(30);
  updateRole.mockReset().mockResolvedValue(undefined);
  deleteRole.mockReset().mockResolvedValue(undefined);
  assignRoleMenus.mockReset().mockResolvedValue(undefined);
});

// 本项目 vitest 未开 globals：显式清理残留 DOM
afterEach(cleanup);

describe('角色页真实化（批次 H Step 4）', () => {
  it('列表渲染：数据范围人话映射、备注缺省「—」、编码不上屏、权限卡按应用分组', async () => {
    renderPage();
    await screen.findByText('超级管理员');

    // dataScope 1 → 全部数据；4 → 本部门及以下；未知兜底不裸奔数字
    expect(screen.getByText('全部数据')).toBeTruthy();
    expect(screen.getByText('本部门及以下')).toBeTruthy();
    expect(screen.queryByText('super_admin')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    // 权限卡：示例应用 + 2 个功能 + 计数
    expect(screen.getByText('新建任务')).toBeTruthy();
    expect(screen.getByText('删除任务')).toBeTruthy();
  });

  it('新增角色：对话框提交创建载荷（含数据范围）', async () => {
    renderPage();
    await screen.findByText('超级管理员');

    fireEvent.click(screen.getByRole('button', { name: /新增角色/ }));
    fireEvent.change(await screen.findByLabelText(/角色名/), { target: { value: '审计员' } });
    fireEvent.change(screen.getByLabelText(/角色编码/), { target: { value: 'auditor' } });
    // 数据范围下拉：对 .dtd-select-selector 打 mousedown 才展开（UsersPage.test 实证）
    const selector = screen.getByLabelText(/数据范围/).closest('.dtd-select-selector') as HTMLElement;
    fireEvent.mouseDown(selector);
    const option = await waitFor(() => {
      const hit = Array.from(document.querySelectorAll('.dtd-select-item-option')).find(
        (node) => node.textContent === '仅本人',
      );
      if (!hit) throw new Error('数据范围选项尚未渲染');
      return hit;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: '创建角色' }));

    await waitFor(() =>
      expect(createRole).toHaveBeenCalledWith(
        expect.objectContaining({ name: '审计员', code: 'auditor', dataScope: 5, sort: 0, status: 0 }),
      ),
    );
    await waitFor(() => expect(fetchRoles).toHaveBeenCalledTimes(2));
  });

  it('配置可用功能：回显收缩半选祖先，保存合并父节点 id（Yudao 口径）', async () => {
    renderPage();
    await screen.findByText('巡检管理员');

    // 第二行是自定义角色（演示无 sorter）：更多操作 → 配置可用功能
    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[1]);
    fireEvent.click(await screen.findByText('配置可用功能'));

    // 树已挂载并回显：目录与「任务管理」是半选（来自 [1,2,201] 的收缩），202 未勾
    const deleteTask = await waitFor(() => {
      const node = Array.from(document.querySelectorAll('.dtd-tree-node-content-wrapper')).find(
        (element) => element.textContent === '删除任务',
      );
      if (!node) throw new Error('菜单树尚未渲染');
      return node;
    });
    // 勾上「删除任务」
    fireEvent.click(deleteTask.closest('.dtd-tree-treenode')?.querySelector('.dtd-tree-checkbox') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    // 提交集 = 勾选 [201, 202] + 祖先 [2, 1]；顺序无关断言
    await waitFor(() => expect(assignRoleMenus).toHaveBeenCalledTimes(1));
    expect(assignRoleMenus.mock.calls[0][0]).toBe(2);
    expect([...assignRoleMenus.mock.calls[0][1]].sort((a, b) => a - b)).toEqual([1, 2, 201, 202]);
  });

  it('删除角色：确认后调用删除端点', async () => {
    renderPage();
    await screen.findByText('巡检管理员');

    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[1]);
    fireEvent.click(await screen.findByText('删除角色'));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(deleteRole).toHaveBeenCalledWith(2));
    await waitFor(() => expect(fetchRoles).toHaveBeenCalledTimes(2));
  });
});
