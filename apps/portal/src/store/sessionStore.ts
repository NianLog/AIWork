import { create } from 'zustand';
import { clearSession, readSession, saveSession } from '../api/yudao';
import type { PortalSession } from '../api/yudao';

/**
 * 门户会话 store（批次 C，P0-4）：会话事实源仍是 sessionStorage（§8.4 [锁定]），
 * 这里做两件事——把「读一次」变成可订阅的身份（外壳、工作台问候语需要随登录态变化），
 * 以及给容器层提供稳定的会话引用。写操作穿透落盘，不存在第二份事实源。
 *
 * 退出登录入口暂未上界面（P0 门户没有退出动线），dropSession 先备好语义。
 */
interface SessionState {
  session: PortalSession | null;
  setSession(session: PortalSession): void;
  dropSession(): void;
}

export const useSessionStore = create<SessionState>((set) => ({
  // 模块创建时水合一次：登录页写会话后调 setSession 同步本 store。
  session: readSession(),
  setSession: (session) => {
    saveSession(session);
    set({ session });
  },
  dropSession: () => {
    clearSession();
    set({ session: null });
  },
}));
