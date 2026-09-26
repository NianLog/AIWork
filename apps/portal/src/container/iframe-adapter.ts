import type { AppInstance, AppRuntimeConfig, PortalSDK } from '@ai-portal/shared-types';

/**
 * iframe 直载适配器（容器第一实现，2026-09-25 批次三契约、批次 C 落地）。
 *
 * 契约要点：
 * - sandbox 令牌白名单：allow-scripts allow-same-origin allow-forms allow-downloads，
 *   刻意不含 allow-top-navigation（子应用不能替用户离开门户）；
 * - 加载失败或 15 秒超时 → mountApp 拒绝 → 工作区落到错误态（失败四要素）；
 * - 桥接仅同源（auth-injection 契约）：load 事件后写入 window.portal 与
 *   __PORTAL_PROPS__ 身份快照，再派发 portal:ready；跨源入口不注入，
 *   子应用以独立模式运行（SDK waitForHost 5 秒超时后明确报缺失）；
 * - unmount 幂等；reload 用同一配置重新挂载。
 */

/** 容器层错误：code 给工作区错误态展示，message 是用户能读的失败原因。 */
export class AppLoadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AppLoadError';
    this.code = code;
  }
}

const LOAD_TIMEOUT_MS = 15_000;
const SANDBOX_TOKENS = 'allow-scripts allow-same-origin allow-forms allow-downloads';

function resolveEntryUrl(entry: string): URL {
  try {
    const url = new URL(entry, window.location.href);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('bad protocol');
    return url;
  } catch {
    throw new AppLoadError('BAD_ENTRY', '应用入口地址无法识别，请检查应用配置。');
  }
}

interface Attachment {
  iframe: HTMLIFrameElement;
  ready: Promise<void>;
}

function attach(cfg: AppRuntimeConfig, mount: HTMLElement): Attachment {
  const entryUrl = resolveEntryUrl(cfg.entry);
  const iframe = document.createElement('iframe');
  iframe.className = 'workspace__frame';
  iframe.title = cfg.name;
  iframe.setAttribute('sandbox', SANDBOX_TOKENS);
  iframe.src = entryUrl.href;

  const ready = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      iframe.removeEventListener('load', onLoad);
      iframe.removeEventListener('error', onError);
    };
    const timer = window.setTimeout(() => {
      finish();
      reject(new AppLoadError('LOAD_TIMEOUT', `${cfg.name}迟迟没有加载完成，请稍后重试。`));
    }, LOAD_TIMEOUT_MS);
    function onLoad() {
      finish();
      resolve();
    }
    function onError() {
      finish();
      reject(new AppLoadError('LOAD_FAILED', `${cfg.name}的地址没有打开成功，请稍后重试。`));
    }
    iframe.addEventListener('load', onLoad);
    iframe.addEventListener('error', onError);
  });

  mount.append(iframe);
  return { iframe, ready };
}

function injectBridge(iframe: HTMLIFrameElement, cfg: AppRuntimeConfig, hostPortal: PortalSDK): void {
  const entryUrl = resolveEntryUrl(cfg.entry);
  if (entryUrl.origin !== window.location.origin) {
    // 跨源入口照样加载（应用仍可用），但没有宿主桥：子应用 SDK 会在超时后
    // 明确报「宿主桥接缺失」，不会误降级成独立壳。
    return;
  }
  const win = iframe.contentWindow as (Window & { __PORTAL_PROPS__?: unknown }) | null;
  if (!win) return;
  try {
    win.portal = hostPortal;
    win.__PORTAL_PROPS__ = cfg.props;
    win.dispatchEvent(new CustomEvent('portal:ready'));
  } catch {
    // 同源判断已通过仍写不进 contentWindow：属异常宿主环境（被安全策略拦截等）。
    // 保留应用可用性，桥接缺失由子应用侧的超时机制显式暴露（subapp-probe 页可诊断）。
  }
}

export async function mountIframeApp(
  cfg: AppRuntimeConfig,
  mount: HTMLElement,
  hostPortal: PortalSDK,
): Promise<AppInstance> {
  let current = attach(cfg, mount);
  try {
    await current.ready;
  } catch (error) {
    current.iframe.remove();
    throw error;
  }
  injectBridge(current.iframe, cfg, hostPortal);

  return {
    async unmount() {
      current.iframe.remove();
    },
    async reload() {
      current.iframe.remove();
      current = attach(cfg, mount);
      try {
        await current.ready;
      } catch (error) {
        current.iframe.remove();
        throw error;
      }
      injectBridge(current.iframe, cfg, hostPortal);
    },
  };
}
