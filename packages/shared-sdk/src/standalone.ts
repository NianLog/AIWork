import type { PortalSDK } from '@ai-portal/shared-types';
import { createEvents } from './events';
import { assertAppId, normalizePath } from './guards';
import { detectHost } from './host';
import { createSession } from './session';
import type { BootstrapOptions, LoginCredentials, StandaloneHandle } from './types';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

/** 独立启动不创建账号或猜测身份服务地址，登录必须由调用方提供。 */
export function bootstrapStandalone(options: BootstrapOptions): StandaloneHandle {
  const { appId, navigate: navigateWithRouter } = options;
  assertAppId(appId);
  if (detectHost()) throw new Error('已检测到宿主桥接，请使用 bootstrapPortal');
  const mount = options.mount ?? document.body;
  if (!mount) throw new Error('请在文档挂载节点就绪后启动 SDK');
  const navigation = (options.navigation ?? [{ label: '首页', path: '/' }]).map((item) => ({
    label: item.label,
    path: normalizePath(item.path),
  }));

  const root = element('section');
  root.dataset.portalStandalone = appId;
  const header = element('header');
  const nav = element('nav');
  nav.setAttribute('aria-label', '应用导航');
  const form = element('form');
  form.setAttribute('aria-label', '独立登录');
  const usernameLabel = element('label', '账号');
  const username = element('input');
  username.name = 'username';
  username.autocomplete = 'username';
  username.required = true;
  usernameLabel.append(username);
  const passwordLabel = element('label', '密码');
  const password = element('input');
  password.name = 'password';
  password.type = 'password';
  password.autocomplete = 'current-password';
  password.required = true;
  passwordLabel.append(password);
  const submit = element('button', '登录');
  submit.type = 'submit';
  const logoutButton = element('button', '退出登录');
  logoutButton.type = 'button';
  logoutButton.dataset.portalLogout = '';
  const status = element('p');
  status.setAttribute('role', 'status');
  const container = element('main');
  container.dataset.portalContent = appId;
  form.append(usernameLabel, passwordLabel, submit);
  header.append(element('h1', options.title ?? appId), nav, form, logoutButton, status);
  root.append(header, container);

  let destroyed = false;
  let busy = false;
  let message: string | undefined;
  let uiRevision = 0;
  const cleanups: Array<() => void> = [];
  const events = createEvents(appId);
  const session = createSession(options, render);

  function assertAlive(): void {
    if (destroyed) throw new Error('SDK 已销毁');
  }

  function render(): void {
    if (destroyed) return;
    const authenticated = session.isAuthenticated();
    form.hidden = authenticated;
    submit.disabled = busy || !options.login;
    logoutButton.hidden = !authenticated && !busy;
    status.textContent = message ?? (busy ? '正在登录…' : authenticated ? '已登录' :
      options.login ? '未登录' : '未配置真实身份服务的登录回调');
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    assertAlive();
    const revision = ++uiRevision;
    busy = true;
    message = undefined;
    render();
    try {
      await session.login(credentials);
    } catch (error) {
      if (!destroyed && revision === uiRevision) message = '登录失败，请检查凭据或身份服务';
      throw error;
    } finally {
      if (!destroyed && revision === uiRevision) {
        busy = false;
        render();
      }
    }
  }

  function logout(): void {
    assertAlive();
    uiRevision += 1;
    busy = false;
    message = undefined;
    password.value = '';
    session.logout();
  }

  const sdk: PortalSDK = {
    auth: { getToken: session.getToken },
    permission: { can: session.can },
    event: events.event,
    navigate(target) {
      assertAlive();
      assertAppId(target.appId);
      const path = normalizePath(target.path);
      if (navigateWithRouter) {
        navigateWithRouter({ appId: target.appId, path });
      } else {
        if (target.appId !== appId) throw new Error('独立模式不支持跨应用导航，请提供导航回调');
        window.location.hash = path;
      }
    },
    async invoke() {
      assertAlive();
      throw new Error('独立模式不支持宿主 JSAPI 调用');
    },
  };

  function listen(node: HTMLElement, name: string, listener: EventListener): void {
    node.addEventListener(name, listener);
    cleanups.push(() => node.removeEventListener(name, listener));
  }

  for (const item of navigation) {
    const button = element('button', item.label);
    button.type = 'button';
    listen(button, 'click', () => {
      try { sdk.navigate({ appId, path: item.path }); } catch {
        if (!destroyed) status.textContent = '导航失败，请检查导航配置';
      }
    });
    nav.append(button);
  }
  listen(form, 'submit', (event) => {
    event.preventDefault();
    if (destroyed || busy) return;
    const credentials = { username: username.value, password: password.value };
    password.value = '';
    // 表单内部消费错误，界面仅显示通用提示；程序调用仍能收到原始拒绝。
    void login(credentials).catch(() => {});
  });
  listen(logoutButton, 'click', () => logout());
  render();
  mount.append(root);

  return {
    mode: 'standalone',
    sdk,
    container,
    login,
    logout,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      uiRevision += 1;
      session.destroy();
      password.value = '';
      for (const cleanup of cleanups.splice(0)) cleanup();
      try { events.destroy(); } finally { root.remove(); }
    },
  };
}
