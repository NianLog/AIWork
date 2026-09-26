import { assertAppId } from './guards';
import { mountHosted, resolveHost } from './host';
import { bootstrapStandalone } from './standalone';
import type { BootstrapOptions, PortalHandle } from './types';

export type { AppRuntimeProps, PortalSDK } from '@ai-portal/shared-types';
export type {
  BootstrapOptions,
  HostedHandle,
  LoginCredentials,
  PortalHandle,
  StandaloneHandle,
  StandaloneSession,
} from './types';
export type { WaitForHostOptions } from './host';
export { bootstrapStandalone } from './standalone';
export { waitForHost, PORTAL_READY_EVENT, isFramedWindow } from './host';

/**
 * 自动选择宿主桥接或独立壳；导入模块本身不会挂载 DOM 或访问存储。
 *
 * 为什么是异步（2026-09-26 批次 C，auth-injection 契约 §3）：宿主在 iframe load
 * 事件之后才注入 window.portal，子应用脚本必然先执行——被嵌入的窗口必须
 * 有界等待（waitForHost：portal:ready 事件 + 250ms 轮询兜底 + 5s 超时），
 * 顶层窗口没有宿主痕迹时立刻走独立壳，不多等一毫秒。
 */
export async function bootstrapPortal(options: BootstrapOptions): Promise<PortalHandle> {
  assertAppId(options.appId);
  const host = await resolveHost();
  return host ? mountHosted(options, host) : bootstrapStandalone(options);
}
