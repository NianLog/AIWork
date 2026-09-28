import { create } from 'zustand';
import {
  ApiError,
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/yudao';
import type { PortalNotification } from '../api/yudao';
import { useSessionStore } from './sessionStore';

/**
 * 站内信 store（批次 V）：未读徽标（外壳导航）与消息页共享同一份状态——
 * 在消息页标了已读，导航徽标即时归零，两处不各拉各的。
 *
 * - unreadCount 用 null 表示「还没拉到 / 拉取失败」：徽标只在 >0 时渲染，
 *   接口缺席（后端未部署）时徽标静默隐藏，不弹错误打扰；
 * - 列表只有消息页消费，错误在页面里呈现重试；401（会话过期）交给路由守卫。
 */
interface NotificationsState {
  unreadCount: number | null;
  list: PortalNotification[];
  listStatus: 'loading' | 'error' | 'success';
  refreshUnread(): Promise<void>;
  fetchList(): Promise<void>;
  markRead(id: number): Promise<void>;
  markAllRead(): Promise<void>;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  unreadCount: null,
  list: [],
  listStatus: 'loading',

  async refreshUnread() {
    try {
      const unreadCount = await fetchUnreadCount();
      set({ unreadCount });
    } catch (error) {
      if (error instanceof ApiError && error.code === 401) {
        useSessionStore.getState().dropSession();
        return;
      }
      // 拉不到就藏徽标（null），下次轮询再试——徽标缺席好过报错刷屏
      set({ unreadCount: null });
    }
  },

  async fetchList() {
    set({ listStatus: 'loading' });
    try {
      const list = await fetchNotifications();
      set({ list, listStatus: 'success' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 401) {
        useSessionStore.getState().dropSession();
        return;
      }
      set({ listStatus: 'error' });
    }
  },

  async markRead(id: number) {
    await markNotificationRead(id);
    await Promise.all([get().refreshUnread(), get().fetchList()]);
  },

  async markAllRead() {
    await markAllNotificationsRead();
    await Promise.all([get().refreshUnread(), get().fetchList()]);
  },
}));
