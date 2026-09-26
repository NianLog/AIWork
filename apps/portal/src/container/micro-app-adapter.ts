import type { AppInstance, AppRuntimeConfig, PortalSDK } from '@ai-portal/shared-types';

/**
 * micro-app 微前端容器适配器：**尚未接入，诚实拒绝**。
 *
 * sandbox=default（共享 DOM 模式）的应用走这里；P0 只开放 iframe 沙箱，
 * 这里不做任何降级或模拟（禁止假实现），错误信息直接说明出路。
 * 接入时按 auth-injection 契约在 created 生命周期 setData(appId, { portal })
 * 注入宿主桥。
 */
export function mountMicroApp(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 诚实拒绝桩：签名对齐 ContainerAdapter 契约，参数刻意不用（tsc 原生豁免 _ 前缀）
  _cfg: AppRuntimeConfig, _mount: HTMLElement, _hostPortal: PortalSDK,
): Promise<AppInstance> {
  return Promise.reject(
    new Error('微前端容器尚未接入：请在应用配置中改用 iframe 沙箱，或等待微前端容器批次开通。'),
  );
}
