import { isValidEventName, isValidPermissionCode } from '@ai-portal/shared-types';

// eslint-disable-next-line no-control-regex -- 安全要求：拒绝路径原文及解码结果中的空白、控制字符和反斜杠，防止导航校验绕过。
const UNSAFE_PATH_CHARACTERS = /[\s\u0000-\u001f\u007f\\]/;

export function assertAppId(appId: string): void {
  if (typeof appId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(appId)) {
    throw new Error('非法 appId');
  }
}

export function isAppPermission(appId: string, code: string): boolean {
  return typeof code === 'string' && isValidPermissionCode(code) && code.startsWith(`${appId}:`);
}

export function assertEventName(appId: string, name: string): void {
  if (typeof name !== 'string' || !isValidEventName(name) || !name.startsWith(`${appId}:`)) {
    throw new Error('事件名必须使用本应用 appId 前缀且包含事件名称');
  }
}

/** 只接收应用内路径；默认以 hash 路由执行，不猜测部署路径或修改宿主路由。 */
export function normalizePath(path: string = '/'): string {
  const invalid = () => new Error('导航路径必须是安全相对路径，不能包含 URL 或目录穿越');
  if (typeof path !== 'string' || !path || UNSAFE_PATH_CHARACTERS.test(path)) {
    throw invalid();
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw invalid();
  }
  const pathname = decoded.split(/[?#]/)[0] ?? '';
  const rawPathname = path.split(/[?#]/)[0] ?? '';
  // 拒绝二次编码和编码分隔符，避免路由器再次解码后改变路径含义。
  if (
    UNSAFE_PATH_CHARACTERS.test(decoded) ||
    decoded.startsWith('//') ||
    pathname.includes(':') ||
    /%(?:25|2f|5c|3a|3f|23)/i.test(rawPathname) ||
    pathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw invalid();
  }
  return path.startsWith('/') ? path : `/${path}`;
}
