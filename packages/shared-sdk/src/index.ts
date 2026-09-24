import { assertAppId } from './guards';
import { detectHost, mountHosted } from './host';
import { bootstrapStandalone } from './standalone';
import type { BootstrapOptions, PortalHandle } from './types';

export type { PortalSDK } from '@ai-portal/shared-types';
export type {
  BootstrapOptions,
  HostedHandle,
  LoginCredentials,
  PortalHandle,
  StandaloneHandle,
  StandaloneSession,
} from './types';
export { bootstrapStandalone } from './standalone';

/** 自动选择宿主桥接或独立壳；导入模块本身不会挂载 DOM 或访问存储。 */
export function bootstrapPortal(options: BootstrapOptions): PortalHandle {
  assertAppId(options.appId);
  const host = detectHost();
  return host ? mountHosted(options, host) : bootstrapStandalone(options);
}
