/**
 * 平台通知能力 API（批次 X 开放能力示例）：子应用经平台统一发通知。
 *
 * 端点 POST /admin-api/portal-notification/app-send——身份是「用户态」：SDK
 * 令牌（登录用户）+ 平台权限码 portal:notify:app-send，appId 声明发起方应用。
 * hosted 形态与门户同源（/admin-api 直达）；standalone 形态经本应用 dev 代理。
 * 令牌由调用方从 SDK 原语现取（契约：子应用不缓存 token）。
 * 完整契约见 docs/子应用接入规范.md。
 */
import manifest from '../../micro-app.config.json';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(message);
  }
}

export interface PlatformNotifyInput {
  userId: number;
  title: string;
  content: string;
}

export async function sendPlatformNotify(token: string, input: PlatformNotifyInput): Promise<void> {
  const response = await fetch('/admin-api/portal-notification/app-send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': '1',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      appId: manifest.appId,
      userId: input.userId,
      title: input.title,
      content: input.content,
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { code: number; msg?: string; data: unknown }
    | null;
  if (!response.ok || !body || body.code !== 0) {
    // 401=登录态失效；403=无 portal:notify:app-send 权限；1_100_007_00x=应用/收件人校验
    throw new ApiError(
      response.status,
      body?.code ?? null,
      body?.msg || `请求失败（HTTP ${response.status}）`,
    );
  }
}
