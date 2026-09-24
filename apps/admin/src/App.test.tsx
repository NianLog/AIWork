// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App';

function openAdmin(path = '/') {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('后台工程骨架', () => {
  it('默认展示登录占位，未接入身份服务时不能提交或进入管理登录态', () => {
    openAdmin();

    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('Yudao Cloud 身份服务未接入');
    expect(screen.getByLabelText<HTMLInputElement>('账号').disabled).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>('密码').disabled).toBe(true);
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: '登录（暂不可用）' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(fireEvent.submit(screen.getByRole('form', { name: '后台登录' }))).toBe(false);
    expect(screen.queryByRole('heading', { name: '应用列表' })).toBeNull();
    expect(window.location.pathname).toBe('/login');
  });

  it('公开预览入口明确不是登录，返回入口始终在后台内部', () => {
    openAdmin('/login');
    fireEvent.click(screen.getByRole('link', { name: '进入工程预览（非登录态）' }));

    expect(screen.getByRole('heading', { name: '应用列表' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
    expect(screen.getByRole('note').textContent).toContain('不包含业务数据');
    expect(screen.queryByRole('button', { name: '退出登录' })).toBeNull();
    const loginLink = screen.getByRole<HTMLAnchorElement>('link', { name: '返回登录入口' });
    expect(loginLink.getAttribute('href')).toBe('/login');
    fireEvent.click(loginLink);
    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeTruthy();
  });

  it('直接进入预览只显示注册应用空态，没有预设应用或虚假增删改操作', () => {
    openAdmin('/preview');
    const applications = screen.getByRole('region', { name: '注册应用' });

    expect(within(applications).getByText('暂无已注册应用')).toBeTruthy();
    expect(applications.textContent).toContain('未连接应用注册服务');
    expect(within(applications).queryAllByRole('link')).toHaveLength(0);
    expect(within(applications).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
  });

  it.each(['用户', '角色', '组织'])('%s 导航只展示待接入空态，并可返回应用列表', (section) => {
    openAdmin('/preview/apps');
    const navigation = screen.getByRole('navigation', { name: '后台导航' });
    fireEvent.click(within(navigation).getByRole('link', { name: section }));

    expect(screen.getByRole('heading', { name: `${section}管理` })).toBeTruthy();
    const emptyState = screen.getByRole('region', { name: `${section}待接入` });
    expect(emptyState.textContent).toContain('Yudao Cloud');
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    fireEvent.click(within(navigation).getByRole('link', { name: '应用列表' }));
    expect(screen.getByRole('heading', { name: '应用列表' })).toBeTruthy();
  });

  it.each(['/missing', '/preview/missing'])('未知地址 %s 显示 404，可恢复到工程预览和登录入口', (path) => {
    openAdmin(path);

    expect(screen.getByRole('heading', { name: '404 · 页面不存在' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: '返回工程预览' }));
    expect(screen.getByRole('heading', { name: '应用列表' })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('工程预览，非登录态');
    fireEvent.click(screen.getByRole('link', { name: '返回登录入口' }));
    expect(screen.getByRole('heading', { name: '登录管理后台' })).toBeTruthy();
  });
});
