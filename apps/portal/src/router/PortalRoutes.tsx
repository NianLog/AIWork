import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PortalShell from '../shell/PortalShell';
import { useSessionStore } from '../store/sessionStore';
import PageFallback from './PageFallback';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * 懒加载（批次 G 路由级代码分割）：业务页各自成 chunk。`lazy()` 在模块级创建、
 * 首次渲染才触发 import——未登录被守卫拦下时对应 chunk 根本不会发起请求。
 *
 * 顺序不变式（勿「优化」）：RequireSession 必须位于 Suspense 上方（同步短路）；
 * sessionStore 模块级同步水合、经本文件进入口 chunk——禁止把守卫或 store 挪进
 * 任何 lazy chunk，否则水合会晚于页面消费。LoginPage/NotFoundPage 保持同步：
 * 前者是守卫落点与未登录首屏，后者的 404 断言是同步查询。
 */
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const StatusPage = lazy(() => import('./pages/StatusPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const SubAppWorkspace = lazy(() => import('./pages/SubAppWorkspace'));

/**
 * 会话守卫（批次 F，负责人拍板甲案全守卫）：/preview 与 /apps 都要求登录，
 * 未登录落登录页并记录来路（state.from），登录成功后回跳。订阅 zustand：
 * 401 终局 dropSession 后守卫自动接管跳转，页面不再需要手动「去登录」引导。
 */
function RequireSession({ children }: { children: ReactNode }) {
  const session = useSessionStore((state) => state.session);
  const location = useLocation();
  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return children;
}

/**
 * 门户路由表。
 *
 * 页头的标题与说明通过 <Route handle> 挂在各页路由上，外壳用 shell/useRouteMeta.ts
 * 读取（声明式 <Routes> 不提供 useMatches）。这样「这一页叫什么」与「这一页挂在哪条路径」
 * 写在同一处：以前是一张按 pathname 手写匹配的 PAGE_META 表，新增路由忘记同步就会
 * 静默显示上一页的标题。
 *
 * 路由约定（引导文档 §10.2）：
 * - /login         门户登录
 * - /apps/:appId/* 子应用工作区
 * - 404            不自动跳转到任意默认子应用
 *
 * /preview/** 与 /apps/** 自批次 F 起由 RequireSession 全守卫（批次 B Decision 5
 * 的「游客预览」路径下线，被批次 F 取代——见 .agents/notes 的批次 F 笔记）。
 *
 * /apps/:appId 是**唯一不套 PortalShell 的路由**，理由见 pages/SubAppWorkspace.tsx：
 * 子应用必须全屏接管，门户的品牌栏、导航、说明条在它上面只会叠加成两层框架。
 *
 * /preview/** 是工程预览专用命名空间：身份服务接入后，真实业务路由走 /apps/:appId/*，
 * 预览路由与其并存但不共享任何权限判定。
 */

export default function PortalRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/preview" element={<RequireSession><PortalShell /></RequireSession>}>
        <Route
          index
          element={<WorkbenchPage />}
          handle={{ title: '工作台', subtitle: '常用工具与推荐应用' }}
        />
        <Route
          path="market"
          element={<MarketPage />}
          handle={{ title: '应用市场', subtitle: '按名称或状态查找应用' }}
        />
        <Route
          path="status"
          element={<StatusPage />}
          handle={{ title: '功能进展', subtitle: '已上线与正在建设的能力' }}
        />
        <Route
          path="notifications"
          element={<NotificationsPage />}
          handle={{ title: '消息', subtitle: '平台公告与提醒' }}
        />
      </Route>
      {/* 子应用工作区：全屏接管，不套 PortalShell（批次 F 起同样要求登录）。
          不套外壳就没有 Outlet 承担 Suspense，这里自带（守卫在外、Suspense 在内）。 */}
      <Route
        path="/apps/:appId/*"
        element={
          <RequireSession>
            <Suspense fallback={<PageFallback />}>
              <SubAppWorkspace />
            </Suspense>
          </RequireSession>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}