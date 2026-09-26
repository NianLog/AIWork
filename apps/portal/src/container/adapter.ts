import type { AppInstance, ContainerAdapter } from '@ai-portal/shared-types';
import { mountIframeApp } from './iframe-adapter';
import { mountMicroApp } from './micro-app-adapter';

/**
 * 容器适配器（§5.1 [锁定]）：按应用配置的 sandbox 字段分发。
 *
 * P0 注册接口只允许 iframe / default 两种取值；default 对应的微前端容器
 * 尚未接入（micro-app-adapter 诚实拒绝）。本模块不读取任何应用白名单——
 * 挂哪个应用由注册表 store 决定（§5.2 主应用不持有白名单）。
 */
const instances = new Map<string, AppInstance>();

export const containerAdapter: ContainerAdapter = {
  async mountApp(cfg, mount, hostPortal) {
    await containerAdapter.unmountApp(cfg.appId);
    const instance =
      cfg.sandbox === 'default'
        ? await mountMicroApp(cfg, mount, hostPortal)
        : await mountIframeApp(cfg, mount, hostPortal);
    instances.set(cfg.appId, instance);
    return instance;
  },
  async unmountApp(appId) {
    const instance = instances.get(appId);
    if (!instance) return;
    instances.delete(appId);
    await instance.unmount();
  },
};
