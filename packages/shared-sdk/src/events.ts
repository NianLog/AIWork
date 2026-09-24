import type { PortalSDK } from '@ai-portal/shared-types';
import { assertEventName } from './guards';

type Handler = (payload: unknown) => void;
interface Subscription {
  name: string;
  handler: Handler;
  dispatch: Handler;
  cancel(): void;
}

/** 宿主订阅也由本实例包装，off 不会删除其他实例或宿主自己的监听。 */
export function createEvents(appId: string, host?: PortalSDK['event']) {
  const subscriptions = new Set<Subscription>();
  let destroyed = false;

  function validate(name: string): void {
    if (destroyed) throw new Error('SDK 已销毁');
    assertEventName(appId, name);
  }

  function cancelAll(items: Subscription[]): void {
    let failure: unknown;
    for (const item of items) {
      try { item.cancel(); } catch (error) { failure ??= error; }
    }
    if (failure !== undefined) throw failure;
  }

  const event: PortalSDK['event'] = {
    on(name, handler) {
      validate(name);
      if (typeof handler !== 'function') throw new Error('事件监听器必须是函数');
      const existing = [...subscriptions].find((item) => item.name === name && item.handler === handler);
      if (existing) return existing.cancel;
      let active = true;
      let unsubscribe: (() => void) | undefined;
      const item: Subscription = {
        name,
        handler,
        dispatch(payload) {
          if (!destroyed && active) handler(payload);
        },
        cancel() {
          if (!active) return;
          active = false;
          subscriptions.delete(item);
          unsubscribe?.();
        },
      };
      subscriptions.add(item);
      try {
        if (host) {
          unsubscribe = host.on(name, item.dispatch);
          if (typeof unsubscribe !== 'function') {
            host.off(name, item.dispatch);
            throw new Error('宿主事件桥接未返回取消监听句柄');
          }
          // 宿主可能在订阅期间同步派发事件并触发销毁。
          if (!active) unsubscribe();
        }
      } catch (error) {
        active = false;
        subscriptions.delete(item);
        throw error;
      }
      return item.cancel;
    },
    emit(name, payload) {
      validate(name);
      if (host) host.emit(name, payload);
      else {
        for (const item of [...subscriptions]) {
          if (item.name === name) item.dispatch(payload);
        }
      }
    },
    off(name, handler) {
      validate(name);
      cancelAll([...subscriptions].filter((item) => item.name === name && (!handler || item.handler === handler)));
    },
  };

  return {
    event,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      cancelAll([...subscriptions]);
    },
  };
}
