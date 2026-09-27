import { loginWithSocial } from './yudao';
import type { PortalSession } from './yudao';

/**
 * 钉钉免登（P0-6 骨架，批次 F 预埋）：凭证审批未下，链路按真实契约先写好，
 * **配置门控**——VITE_DINGTALK_CORP_ID 未配置或不在钉钉容器内时登录页不渲染
 * 免登入口（诚实缺席，不放假按钮）。凭证批准后的接续清单见批次 F 笔记。
 *
 * 链路：钉钉容器内加载官方 JSAPI → dd.runtime.permission.requestAuthCode(corpId)
 * 拿免登授权码 → yudao.ts 的 loginWithSocial（POST /admin-api/system/auth/
 * social-login，type=20 DINGTALK，后端 SocialTypeEnum）→ get-permission-info →
 * PortalSession——与账号密码登录同一条收尾（establishSession）。
 */

/** 后端 SocialTypeEnum.DINGTALK = 20（cn.iocoder.yudao.module.system.enums.social）。 */
const DINGTALK_SOCIAL_TYPE = 20;

/** 钉钉官方 JSAPI CDN（只在钉钉容器内按需加载）。 */
const JSAPI_SRC = 'https://g.alicdn.com/dingding/dingtalk-jsapi/3.0.25/dingtalk.open.js';

export const DINGTALK_CORP_ID = (import.meta.env.VITE_DINGTALK_CORP_ID ?? '').trim();

interface DingtalkRuntimePermission {
  requestAuthCode(params: {
    corpId: string;
    onSuccess: (result: { code: string }) => void;
    onFail: (error: unknown) => void;
  }): void;
}

interface DingtalkSdk {
  runtime: { permission: DingtalkRuntimePermission };
  ready(callback: () => void): void;
}

declare global {
  interface Window {
    dd?: DingtalkSdk;
  }
}

export function isDingtalkContainer(): boolean {
  return typeof navigator !== 'undefined' && /DingTalk/i.test(navigator.userAgent);
}

/** 免登入口可见性：在钉钉容器内且已配置 corpId（门控条件，登录页据此渲染）。 */
export function dingtalkLoginAvailable(): boolean {
  return isDingtalkContainer() && DINGTALK_CORP_ID.length > 0;
}

let jsapiLoading: Promise<void> | undefined;

function loadDingtalkJsapi(): Promise<void> {
  if (window.dd) return Promise.resolve();
  if (jsapiLoading) return jsapiLoading;
  jsapiLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSAPI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      jsapiLoading = undefined;
      reject(new Error('钉钉 JSAPI 没有加载成功，请检查网络后重试。'));
    };
    document.head.appendChild(script);
  });
  return jsapiLoading;
}

/** 免登授权码：corpId 换一次性 code（dd.ready 等容器就绪后再取）。 */
async function requestAuthCode(corpId: string): Promise<string> {
  await loadDingtalkJsapi();
  const dd = window.dd;
  if (!dd) {
    throw new Error('钉钉 JSAPI 没有加载成功。');
  }
  return new Promise((resolve, reject) => {
    dd.ready(() => {
      dd.runtime.permission.requestAuthCode({
        corpId,
        onSuccess: (result) => resolve(result.code),
        onFail: (error) => reject(new Error(`钉钉免登授权失败：${String(error)}`)),
      });
    });
  });
}

/** 钉钉一键登录：授权码换会话（social-login 的服务端配置与用户绑定见接续清单）。 */
export async function loginWithDingtalk(): Promise<PortalSession> {
  if (!DINGTALK_CORP_ID) {
    throw new Error('钉钉免登未配置（缺 VITE_DINGTALK_CORP_ID），请用账号密码登录。');
  }
  const code = await requestAuthCode(DINGTALK_CORP_ID);
  return loginWithSocial(DINGTALK_SOCIAL_TYPE, code);
}
