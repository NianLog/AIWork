// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DingtalkBindingPage from './DingtalkBindingPage';

/**
 * 钉钉绑定页测试（批次 X）：vi.mock api 模块，锁——列表渲染（昵称 join、
 * 未匹配用户兜底 #id）、绑定动线（选用户+填 userid→bindDingtalk→刷新）、
 * 绑定/解绑失败文案如实上屏、加载错误态重试。「通道凭据后补仅站内信」是
 * 页面文案承诺，一并锁定，防后来人误读为「绑了就会推钉钉」。
 *
 * 按钮名用 regex：dtd 对两字中文按钮可能插空格（「绑 定」），不带空格的
 * 精确匹配会随组件版本漂移。
 */

const fetchDingtalkBindings = vi.fn();
const bindDingtalk = vi.fn();
const unbindDingtalk = vi.fn();
const fetchUsers = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchDingtalkBindings: (...args: unknown[]) => fetchDingtalkBindings(...args),
    bindDingtalk: (...args: unknown[]) => bindDingtalk(...args),
    unbindDingtalk: (...args: unknown[]) => unbindDingtalk(...args),
    fetchUsers: (...args: unknown[]) => fetchUsers(...args),
  };
});

const USERS = [
  { id: 1, username: 'admin', nickname: '管理员', status: 0 },
  { id: 2, username: 'gwtest', nickname: '灰度测试', status: 0 },
];

// userId 3 不在用户列表里：锁 #id 兜底展示
const BINDINGS = [
  { id: 9, userId: 1, dingtalkUserid: 'u-admin', updateTime: 1780000000000 },
  { id: 10, userId: 3, dingtalkUserid: 'u-ghost', updateTime: 1780000001000 },
];

function openPage() {
  render(
    <MemoryRouter>
      <DingtalkBindingPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchDingtalkBindings.mockReset().mockResolvedValue(BINDINGS);
  bindDingtalk.mockReset().mockResolvedValue(undefined);
  unbindDingtalk.mockReset().mockResolvedValue(undefined);
  fetchUsers.mockReset().mockResolvedValue(USERS);
});

afterEach(cleanup);

describe('DingtalkBindingPage', () => {
  it('渲染绑定列表：昵称 join、未匹配用户兜底 #id、凭据后补文案在屏', async () => {
    openPage();
    expect(await screen.findByText('u-admin')).toBeTruthy();
    expect(screen.getByText('管理员')).toBeTruthy();
    expect(screen.getByText('#3')).toBeTruthy();
    expect(screen.getByText('u-ghost')).toBeTruthy();
    expect(screen.getByText(/通道企业凭据配置前，绑定仅作数据准备/)).toBeTruthy();
  });

  it('绑定动线：选用户填 userid → bindDingtalk → 刷新列表', async () => {
    openPage();
    await screen.findByText('u-admin');
    // 下拉只列未绑定用户（1/3 已绑定或不在列表，只剩灰度测试）
    fireEvent.change(screen.getByLabelText('平台用户'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('钉钉开放平台通讯录里的 userid'), {
      target: { value: 'u-gw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /绑\s*定/ }));
    await waitFor(() => expect(bindDingtalk).toHaveBeenCalledWith(2, 'u-gw'));
    // 成功后 reload：列表接口被再次请求
    await waitFor(() => expect(fetchDingtalkBindings).toHaveBeenCalledTimes(2));
  });

  it('绑定失败：错误文案如实上屏（role=alert）', async () => {
    bindDingtalk.mockRejectedValueOnce(new Error('网络暂时没有响应'));
    openPage();
    await screen.findByText('u-admin');
    fireEvent.change(screen.getByLabelText('平台用户'), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText('钉钉开放平台通讯录里的 userid'), {
      target: { value: 'u-gw' },
    });
    fireEvent.click(screen.getByRole('button', { name: /绑\s*定/ }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('网络暂时没有响应');
  });

  it('解绑动线：行内解绑 → unbindDingtalk → 刷新列表', async () => {
    openPage();
    await screen.findByText('u-admin');
    // 两条绑定各有一个解绑按钮，取第一行（userId 1）的
    fireEvent.click(screen.getAllByRole('button', { name: /解\s*绑/ })[0]);
    await waitFor(() => expect(unbindDingtalk).toHaveBeenCalledWith(1));
    await waitFor(() => expect(fetchDingtalkBindings).toHaveBeenCalledTimes(2));
  });

  it('加载失败：错误态与重试', async () => {
    fetchDingtalkBindings.mockRejectedValueOnce(new Error('网络暂时没有响应'));
    openPage();
    expect(await screen.findByText('无法加载钉钉绑定')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }));
    await waitFor(() => expect(fetchDingtalkBindings).toHaveBeenCalledTimes(2));
  });
});
