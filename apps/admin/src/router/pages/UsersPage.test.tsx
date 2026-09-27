// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UsersPage from './UsersPage';

/**
 * 用户页真实化测试（批次 H Step 3）：vi.mock api 模块函数，锁——
 * 两态渲染与缺省「—」、新增/停用/调整角色的写调用形态。
 * 请求链路语义（信封/401/刷新）由 api/yudao.test 与 App.test 各守一份。
 */

const fetchUsers = vi.fn();
const fetchDepts = vi.fn();
const fetchRoles = vi.fn();
const fetchUserRoles = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const updateUserStatus = vi.fn();
const assignUserRoles = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchUsers: (...args: unknown[]) => fetchUsers(...args),
    fetchDepts: (...args: unknown[]) => fetchDepts(...args),
    fetchRoles: (...args: unknown[]) => fetchRoles(...args),
    fetchUserRoles: (...args: unknown[]) => fetchUserRoles(...args),
    createUser: (...args: unknown[]) => createUser(...args),
    updateUser: (...args: unknown[]) => updateUser(...args),
    updateUserStatus: (...args: unknown[]) => updateUserStatus(...args),
    assignUserRoles: (...args: unknown[]) => assignUserRoles(...args),
  };
});

const USERS = [
  {
    id: 11, username: 'linwei', nickname: '林蔚', deptId: 103, deptName: '研发部门',
    mobile: '13800000001', email: '', sex: 0, avatar: '', postIds: [], remark: '',
    status: 0 as const, loginDate: 1790400000000, createTime: 1780000000000,
  },
  {
    id: 12, username: 'wutong', nickname: '吴桐', deptId: 101, deptName: '深圳总公司',
    mobile: '', email: '', sex: 1, avatar: '', postIds: null, remark: '',
    status: 1 as const, loginDate: 0, createTime: 1780000000001,
  },
  {
    id: 13, username: 'zhouyu', nickname: '周雨', deptId: 103, deptName: '研发部门',
    mobile: '13800000003', email: '', sex: 0, avatar: '', postIds: [], remark: '',
    status: 0 as const, loginDate: 0, createTime: 1780000000002,
  },
];

const ROLES = [
  { id: 1, name: '超级管理员', code: 'super_admin', sort: 1, status: 0 as const, type: 1, dataScope: 1, remark: '', createTime: 0 },
  { id: 2, name: '普通角色', code: 'common', sort: 2, status: 0 as const, type: 1, dataScope: 2, remark: '', createTime: 0 },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchUsers.mockReset().mockResolvedValue(USERS);
  fetchDepts.mockReset().mockResolvedValue([]);
  fetchRoles.mockReset().mockResolvedValue(ROLES);
  fetchUserRoles.mockReset().mockResolvedValue([2]);
  createUser.mockReset().mockResolvedValue(20);
  updateUser.mockReset().mockResolvedValue(undefined);
  updateUserStatus.mockReset().mockResolvedValue(undefined);
  assignUserRoles.mockReset().mockResolvedValue(undefined);
});

// 本项目 vitest 未开 globals：显式清理残留 DOM
afterEach(cleanup);

describe('用户页真实化（批次 H Step 3）', () => {
  it('列表渲染：两态标签、缺省显示「—」，「从未登录」演示语义已删', async () => {
    renderPage();
    await screen.findByText('林蔚');

    expect(screen.getByText('共 3 位成员')).toBeTruthy();
    // 状态标签与统计卡同名并存：在职可用 2 行 + 卡 1 张
    expect(screen.getAllByText('在职可用').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('已停用').length).toBeGreaterThanOrEqual(2);
    // 吴桐手机号缺省、吴桐/周雨从未登录 → 「—」
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('从未登录')).toBeNull();
    expect(screen.queryByText('待激活')).toBeNull();
  });

  it('新增成员：对话框提交创建载荷（含初始密码与部门）', async () => {
    fetchDepts.mockResolvedValue([{ id: 103, parentId: 0, name: '研发部门', sort: 0, leaderUserId: null, phone: '', email: '', status: 0 as const, createTime: 0 }]);
    renderPage();
    await screen.findByText('林蔚');

    fireEvent.click(screen.getByRole('button', { name: /新增成员/ }));
    fireEvent.change(await screen.findByLabelText(/姓名/), { target: { value: '沈一' } });
    fireEvent.change(screen.getByLabelText(/账号/), { target: { value: 'shenyi' } });
    fireEvent.change(screen.getByLabelText(/初始密码/), { target: { value: 'Pass1234' } });
    // 部门下拉：getByLabelText 返回控件（input）——向上找根节点 mousedown 展开。
    // 选项在 portal 里异步渲染：等「下拉选项类 + 文本匹配」的节点出现再点，
    // 直接 findAllByText 会抢先命中表格里的部门单元格。
    // 部门下拉：getByLabelText 返回控件（input）——控件之上的 .dtd-select-selector
    // 才是开合事件的目标（dtd 与 antd 不同，不在根节点委托，2026-09-27 探针实证）。
    // 选项在 portal 里异步渲染：等「下拉选项类 + 文本匹配」的节点出现再点，
    // 直接 findAllByText 会抢先命中表格里的部门单元格。
    const selector = screen.getByLabelText(/所属部门/)
      .closest('.dtd-select-selector') as HTMLElement;
    fireEvent.mouseDown(selector);
    const option = await waitFor(() => {
      const hit = Array.from(document.querySelectorAll('.dtd-select-item-option')).find(
        (node) => node.textContent === '研发部门',
      );
      if (!hit) throw new Error('部门选项尚未渲染');
      return hit;
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByRole('button', { name: '创建成员' }));

    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'shenyi', nickname: '沈一', password: 'Pass1234', deptId: 103 }),
      ),
    );
    // 保存成功后刷新列表
    await waitFor(() => expect(fetchUsers).toHaveBeenCalledTimes(2));
  });

  it('停用成员：确认后走 update-status 端点', async () => {
    renderPage();
    await screen.findByText('林蔚');

    // 默认按最近登录排序，第一行是林蔚（唯一有登录时间的成员）
    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[0]);
    fireEvent.click(await screen.findByText('停用成员'));
    fireEvent.click(await screen.findByRole('button', { name: '确认停用' }));

    await waitFor(() => expect(updateUserStatus).toHaveBeenCalledWith(11, 1));
  });

  it('调整角色：回显勾选后提交全量分配', async () => {
    renderPage();
    await screen.findByText('林蔚');

    fireEvent.click(screen.getAllByRole('button', { name: '更多操作' })[0]);
    fireEvent.click(await screen.findByText('调整角色'));

    await screen.findByText('普通角色');
    // 勾上第一项（超级管理员，当前未勾选）
    fireEvent.click(document.querySelector('input[type="checkbox"]') as HTMLInputElement);
    fireEvent.click(screen.getByRole('button', { name: '保存分配' }));

    // Checkbox.Group 按选项序返回勾选值，断言顺序无关
    await waitFor(() => expect(assignUserRoles).toHaveBeenCalledTimes(1));
    expect(assignUserRoles.mock.calls[0][0]).toBe(11);
    expect([...assignUserRoles.mock.calls[0][1]].sort()).toEqual([1, 2]);
  });
});
