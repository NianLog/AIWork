// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

function openPortal(path = '/') {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('门户工程骨架', () => {
  it('默认进入登录占位页，身份服务未接入时不能提交或进入登录态', () => {
    openPortal();

    expect(screen.getByRole('heading', { name: '登录 AI 中台' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('Yudao Cloud 身份服务未接入');
    expect(screen.getByLabelText<HTMLInputElement>('账号').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('密码').disabled).toBe(true);
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: '登录（暂不可用）' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(fireEvent.submit(screen.getByRole('form', { name: '门户登录' }))).toBe(false);
    expect(screen.queryByRole('heading', { name: '工作台' })).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });

  it('只能通过明确的工程预览入口查看骨架，持续标明非登录态', () => {
    openPortal('/login');
    fireEvent.click(screen.getByRole('link', { name: '进入工程预览（非登录态）' }));

    expect(screen.getByRole('heading', { name: '工作台' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
    expect(screen.getByRole('note').textContent).toContain('不包含业务数据');
    expect(screen.queryByRole('button', { name: '退出登录' })).toBeNull();
    fireEvent.click(screen.getByRole('link', { name: '返回登录入口' }));
    expect(screen.getByRole('heading', { name: '登录 AI 中台' })).toBeTruthy();
  });

  it('平台导航仅在工作台与接入状态之间切换，不将预览当成登录', () => {
    openPortal('/preview');
    const navigation = screen.getByRole('navigation', { name: '平台导航' });
    expect(within(navigation).getAllByRole('link').map((link) => link.textContent)).toEqual([
      '工作台',
      '接入状态',
    ]);
    fireEvent.click(within(navigation).getByRole('link', { name: '接入状态' }));
    expect(screen.getByRole('heading', { name: '接入状态' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
    fireEvent.click(within(navigation).getByRole('link', { name: '工作台' }));
    expect(screen.getByRole('heading', { name: '工作台' })).toBeTruthy();
  });

  it('直接打开预览时动态应用区为空，不提供硬编码的子应用入口', () => {
    openPortal('/preview');
    const applications = screen.getByRole('region', { name: '动态应用' });

    expect(within(applications).getByText('暂无已注册应用')).toBeTruthy();
    expect(applications.textContent).toContain('未连接应用注册服务');
    expect(within(applications).queryAllByRole('link')).toHaveLength(0);
    expect(within(applications).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
  });

  it.each(['/missing', '/preview/missing'])('未知地址 %s 提供 404 和返回入口', (path) => {
    openPortal(path);

    expect(screen.getByRole('heading', { name: '404 · 页面不存在' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: '返回工程预览' }));
    expect(screen.getByRole('heading', { name: '工作台' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
    fireEvent.click(screen.getByRole('link', { name: '返回登录入口' }));
    expect(screen.getByRole('heading', { name: '登录 AI 中台' })).toBeTruthy();
  });
});
