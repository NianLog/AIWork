/**
 * 权限码类型定义 —— 对应 §6.2 权限码契约
 * 格式: appId:resource:action
 */

/** 权限码字符串，格式: appId:resource:action */
export type PermissionCode = string;

/** 权限码集合 */
export type PermissionSet = Set<PermissionCode>;

/**
 * 校验权限码格式: appId:resource:action
 * 各段只允许小写字母、数字、连字符
 */
export function isValidPermissionCode(code: string): boolean {
  return /^[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$/.test(code);
}

/**
 * 从权限码中提取 appId 前缀
 * 例: "ai-video-gen:task:create" → "ai-video-gen"
 */
export function extractAppId(code: PermissionCode): string {
  return code.split(':')[0];
}
