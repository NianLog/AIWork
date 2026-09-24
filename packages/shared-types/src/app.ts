/**
 * 容器运行时类型定义 —— 对应 §5.1 容器适配层接口 [锁定]
 */
import type { AppFramework, SandboxMode } from './manifest';
import type { MicroAppPermission } from './manifest';

/** 应用运行时配置，驱动容器动态渲染 */
export interface AppRuntimeConfig {
  /** 应用唯一标识，如 ai-video-gen */
  appId: string;
  /** 应用显示名称 */
  name: string;
  /** 子应用入口地址，如 https://cdn.../apps/{appId}/{version}/index.html */
  entry: string;
  /** 路由基础路径，如 /ai-video */
  baseRoute: string;
  /** 子应用框架 */
  framework: AppFramework;
  /** 沙箱模式，Vite/ESM 产物用 iframe */
  sandbox: SandboxMode;
  /** 注入子应用的属性：token、user、permissions 等 */
  props: AppRuntimeProps;
}

/** 注入子应用的运行时属性 */
export interface AppRuntimeProps {
  /** 当前用户 token */
  token: string;
  /** 当前用户信息 */
  user: AppRuntimeUser;
  /** 当前用户在此应用下的权限码集合 */
  permissions: string[];
  [key: string]: unknown;
}

/** 注入子应用的用户信息 */
export interface AppRuntimeUser {
  userId: string;
  username: string;
  nickname: string;
  tenantId?: string;
  orgId?: string;
  roles: string[];
}

/** 已挂载的应用实例 */
export interface AppInstance {
  /** 卸载应用 */
  unmount(): Promise<void>;
  /** 重新加载 */
  reload(): Promise<void>;
}

/** 容器适配器统一接口 */
export interface ContainerAdapter {
  /** 挂载应用，返回应用实例 */
  mountApp(cfg: AppRuntimeConfig): Promise<AppInstance>;
  /** 卸载应用 */
  unmountApp(appId: string): Promise<void>;
}

/** 应用列表接口返回的注册信息 */
export interface AppRegistry {
  appId: string;
  name: string;
  entry: string;
  baseRoute: string;
  framework: AppFramework;
  sandbox: SandboxMode;
  version: string;
  icon?: string;
  status: number; // 1=启用 0=禁用
  permissions: MicroAppPermission[];
}
