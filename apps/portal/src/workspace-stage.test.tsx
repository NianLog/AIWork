// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkspaceStage from './router/parts/WorkspaceStage';

/**
 * 工作区舞台三态（批次 C 起，not-integrated 已随演示目录删除）：
 * loading / error 由本组件承担；ready 时组件返回 null——挂载位由容器层
 * AppMount 提供，舞台不与子应用抢 DOM。
 */

afterEach(() => cleanup());

describe('WorkspaceStage 三态', () => {
  it('loading：status 地标播报正在打开，出现应用名', () => {
    render(
      <WorkspaceStage status="loading" app={{ name: 'AI 图像工坊' }} onRetry={() => {}} onExit={() => {}} />,
    );

    expect(screen.getByRole('status', { name: '正在打开应用' })).toBeTruthy();
    expect(screen.getByText('正在打开 AI 图像工坊…')).toBeTruthy();
  });

  it('error：错误码 + 发生了什么 + 重试/返回双出口，回调可达', () => {
    const retry = vi.fn();
    const exit = vi.fn();
    render(
      <WorkspaceStage
        status="error"
        app={{ name: 'AI 图像工坊' }}
        errorCode="LOAD_TIMEOUT"
        errorText="AI 图像工坊迟迟没有加载完成，请稍后重试。"
        onRetry={retry}
        onExit={exit}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('LOAD_TIMEOUT');
    expect(alert.textContent).toContain('无法打开 AI 图像工坊');
    expect(alert.textContent).toContain('迟迟没有加载完成');

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it('ready：舞台不渲染任何东西，挂载位交给容器层', () => {
    const { container } = render(
      <WorkspaceStage status="ready" app={{ name: 'AI 图像工坊' }} onRetry={() => {}} onExit={() => {}} />,
    );

    expect(container.innerHTML).toBe('');
  });
});
