/**
 * 子应用清单类型 —— 对应 §6.1 micro-app.config.json JSON Schema
 * [锁定] 改动需人类确认
 */

export type AppFramework = 'vue2' | 'vue3' | 'react' | 'angular' | 'svelte' | 'vanilla';
export type SandboxMode = 'default' | 'iframe';

export interface MicroAppPermission {
  /** 权限码，格式: appId:resource:action，例: ai-video-gen:task:create */
  code: string;
  /** 权限名称 */
  name: string;
  /** 所属模块 */
  module: string;
  /** 权限描述 */
  description?: string;
}

export interface MicroAppManifest {
  /** 应用唯一标识，如 ai-video-gen */
  appId: string;
  /** 应用显示名称 */
  name: string;
  /** 语义化版本号，如 1.2.0 */
  version: string;
  /** 子应用框架 */
  framework: AppFramework;
  /** 路由基础路径，如 /ai-video */
  baseRoute: string;
  /** 子应用后端 API 地址 */
  backendApi: string;
  /** 沙箱模式，Vite/ESM 产物用 iframe */
  sandbox: SandboxMode;
  /** 权限码声明列表 */
  permissions: MicroAppPermission[];
}
