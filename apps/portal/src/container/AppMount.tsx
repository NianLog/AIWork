import { useEffect, useRef, useState } from 'react';
import type { AppInstance } from '@ai-portal/shared-types';
import WorkspaceStage from '../router/parts/WorkspaceStage';
import { buildRuntimeConfig } from '../store/appRegistryStore';
import type { PortalApp } from '../store/appRegistryStore';
import { useSessionStore } from '../store/sessionStore';
import { containerAdapter } from './adapter';
import { portalHost } from './hostPortal';
import { AppLoadError } from './iframe-adapter';

/**
 * 子应用挂载宿主组件（批次 C，P0-4）：真实加载状态机。
 *
 * 职责边界：
 * - 本组件只做「生命周期 → 舞台状态」：loading →（load 事件）→ ready，
 *   失败（含 15s 超时）→ error；重试 = 卸载后按同一配置重新挂载；
 * - 身份快照在 store 层拼装（buildRuntimeConfig，auth-injection 契约），
 *   会话变化（重新登录）会触发重挂载——props 是挂载瞬间的快照；
 * - 挂载节点（.workspace__mount）常驻 DOM：加载骨架显示期间 iframe 就在
 *   隐藏挂载位里并行加载，就绪瞬间切换显示，用户不看到空白帧。
 */

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'error'; code: string; text: string };

export default function AppMount({ app, onExit }: { app: PortalApp; onExit: () => void }) {
  const session = useSessionStore((state) => state.session);
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let cancelled = false;
    let instance: AppInstance | undefined;
    setPhase({ kind: 'loading' });
    void (async () => {
      try {
        const cfg = buildRuntimeConfig(app, session);
        instance = await containerAdapter.mountApp(cfg, mount, portalHost);
        // StrictMode（或依赖变更）可能在挂载完成前就跑了清理——此刻 instance 刚就绪
        // 即成孤儿（清理扑空），立刻卸掉，否则 DOM 里会残留第二份 iframe。
        if (cancelled) {
          void instance.unmount();
          return;
        }
        setPhase({ kind: 'ready' });
      } catch (error) {
        if (cancelled) return;
        const code = error instanceof AppLoadError ? error.code : 'MOUNT_FAILED';
        const text = error instanceof Error ? error.message : `${app.name}没有打开成功，请稍后重试。`;
        setPhase({ kind: 'error', code, text });
      }
    })();
    return () => {
      cancelled = true;
      void instance?.unmount();
    };
    // 依赖挂关键配置字段与会话：对象身份每次拉取都会变，不能整个 app 进依赖。
  }, [app.appId, app.version, app.entry, app.sandbox, session, attempt]);

  return (
    <div className={`workspace__stage${phase.kind === 'ready' ? ' workspace__stage--flat' : ''}`}>
      <div
        ref={mountRef}
        className={`workspace__mount${phase.kind === 'ready' ? '' : ' workspace__mount--pending'}`}
        data-phase={phase.kind}
      />
      <WorkspaceStage
        status={phase.kind}
        app={{ name: app.name }}
        errorCode={phase.kind === 'error' ? phase.code : undefined}
        errorText={phase.kind === 'error' ? phase.text : undefined}
        onRetry={() => setAttempt((count) => count + 1)}
        onExit={onExit}
      />
    </div>
  );
}
