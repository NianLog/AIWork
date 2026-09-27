/**
 * 容器运行时类型定义 —— 对应 §5.1 容器适配层接口 [锁定]
 */
import type { AppFramework, SandboxMode } from './manifest';
import type { MicroAppPermission } from './manifest';
import type { PortalSDK } from './sdk';

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

/**
 * 容器适配器统一接口。
 *
 * mount 接收宿主提供的挂载节点与宿主 PortalSDK 实例：挂载点由 React 层（AppMount）
 * 持有，宿主桥由门户会话层构造——适配器只负责传输，不组装身份（auth-injection 契约：
 * props 快照在 store 层拼装，token 一律走 portal.auth.getToken()）。
 */
export interface ContainerAdapter {
  /** 挂载应用，返回应用实例 */
  mountApp(cfg: AppRuntimeConfig, mount: HTMLElement, hostPortal: PortalSDK): Promise<AppInstance>;
  /** 卸载应用 */
  unmountApp(appId: string): Promise<void>;
}

/** 应用列表接口返回的注册信息 */
export interface AppRegistry {
  appId: string;
  name: string;
  entry: string;
  /** 网关按 /api/{appId}/** 代理的目标后端地址（§9.1 sys_app.backend_api；2026-09-25 契约补齐） */
  backendApi: string;
  baseRoute: string;
  framework: AppFramework;
  sandbox: SandboxMode;
  version: string;
  icon?: string;
  /** 0=启用 1=停用（对齐后端 CommonStatusEnum；2026-09-26 批次 C 从「1=启用」翻转为后端口径，换算收敛点全部删除） */
  status: number;
  permissions: MicroAppPermission[];
}
