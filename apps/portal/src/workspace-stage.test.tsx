// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkspaceStage from './router/parts/WorkspaceStage';
import { DEMO_APPS } from './store/demoCatalog';

/**
 * 工作区舞台四态（2026-09-25 批次三）：loading / error / not-integrated
 * 今天没有真实触发路径（演示 entry 是保留域），直接喂状态渲染覆盖。
 * ready 态只是挂载位，没有可断言的行为，不单测。
 *
 * 锁的性质：
 * - loading：role=status 播报「正在打开」，彩虹条与骨架都在场且不进无障碍树；
 * - error：失败四要素（错误码 + 标题 + 原因 + 动作）齐全，两个出口都真的回调；
 * - not-integrated：说明 + 返回工作台的出口，不出现任何门户导航。
 */
function renderStage(props: Partial<Parameters<typeof WorkspaceStage>[0]> = {}) {
  const onRetry = vi.fn();
  const onExit = vi.fn();
  const utils = render(
    <MemoryRouter>
      <WorkspaceStage
        status="not-integrated"
        app={DEMO_APPS[0]}
        onRetry={onRetry}
        onExit={onExit}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onRetry, onExit, ...utils };
}

afterEach(() => {
  cleanup();
});

describe('工作区舞台四态', () => {
  it('loading：正在打开的播报在场，彩虹条与骨架是装饰', () => {
    renderStage({ status: 'loading' });

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toContain('正在打开');
    expect(status.querySelector('.ui-rainbow-bar')).not.toBeNull();
    expect(status.querySelector('.ui-rainbow-bar')?.getAttribute('aria-hidden')).toBe('true');
    expect(status.querySelectorAll('.ui-skeleton').length).toBeGreaterThan(0);
    // 状态播报区里不该出现错误出口或返回链接
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
  });

  it('error：失败四要素齐全，重试与返回工作台都真的回调', () => {
    const { onRetry, onExit } = renderStage({
      status: 'error',
      errorCode: 'APP_BOOT_TIMEOUT',
      errorText: '应用启动超时，稍后重试一般就能恢复。',
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('APP_BOOT_TIMEOUT');
    expect(alert.textContent).toContain('无法打开');
    expect(alert.textContent).toContain('应用启动超时');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('not-integrated：说明在场，返回工作台是链接出口', () => {
    renderStage();

    expect(screen.getByText(/还没有接入这里/)).toBeTruthy();
    const back = screen.getByRole('link', { name: '返回工作台' });
    expect(back.getAttribute('href')).toBe('/preview');
    // 空态点缀：彩虹短条在场且纯装饰
    expect(document.querySelector('.workspace__placeholder-rainbow')?.getAttribute('aria-hidden')).toBe('true');
  });
});
