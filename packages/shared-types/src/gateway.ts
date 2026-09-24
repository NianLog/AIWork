/**
 * 网关透传头类型 —— 对应 §8.2 [锁定]，字段不得改名
 */

/** §8.2 网关透传头字段名 */
export const GATEWAY_HEADERS = {
  USER_ID: 'X-User-Id',
  TENANT_ID: 'X-Tenant-Id',
  ORG_ID: 'X-Org-Id',
  USER_ROLES: 'X-User-Roles',
  APP_ID: 'X-App-Id',
  REQUEST_ID: 'X-Request-Id',
  USER_PERMISSIONS: 'X-User-Permissions',
} as const;

/** 透传头类型 */
export interface GatewayHeaders {
  [GATEWAY_HEADERS.USER_ID]: string;
  [GATEWAY_HEADERS.TENANT_ID]: string;
  [GATEWAY_HEADERS.ORG_ID]: string;
  [GATEWAY_HEADERS.USER_ROLES]: string;
  [GATEWAY_HEADERS.APP_ID]: string;
  [GATEWAY_HEADERS.REQUEST_ID]: string;
  [GATEWAY_HEADERS.USER_PERMISSIONS]: string;
}

/** 网关统一响应格式 */
export interface GatewayResponse<T = unknown> {
  code: number; // 0=成功
  msg: string;
  data: T;
}

/** token 响应 */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // 毫秒时间戳
  user: GatewayUser;
}

/** 用户信息 */
export interface GatewayUser {
  userId: string;
  username: string;
  nickname: string;
  tenantId: string;
  orgId: string;
  roles: string[];
  avatar?: string;
}
