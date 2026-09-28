import type { ReactNode } from 'react';
import { lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AdminShell from '../shell/AdminShell';
import { readSession } from '../api/yudao';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * 懒加载（批次 G 路由级代码分割）：五个业务页各自成 chunk，Suspense 由
 * AdminShell 的 Outlet 统一承担（外壳 h1/导航/披露条在边界外同步渲染，chunk
 * 加载期间只有内容区出骨架）。路由表因此只换 import，不加逐路由 Suspense。
 *
 * 顺序不变式（勿「优化」）：RequireAdminSession 必须位于任何 lazy 元素之外
 * （同步短路，未登录深链零 chunk 请求）；readSession 在入口 chunk 就绪。
 * LoginPage/NotFoundPage 保持同步：守卫落点/首屏与 404 同步断言。
 */
const ApplicationsPage = lazy(() => import('./pages/ApplicationsPage'));
const PublishPage = lazy(() => import('./pages/PublishPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const RolesPage = lazy(() => import('./pages/RolesPage'));
const OrganizationsPage = lazy(() => import('./pages/OrganizationsPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage'));

/**
 * 会话守卫（批次 F）：/preview 要求登录。沿后台既有惯例「登录/退出必经路由跳转」
 * 做非响应式检查（useLocation 让每次导航都重新求值）；401 终局由页面主动
 * navigate('/login') 兜底。未登录落登录页并记录来路（state.from），登录后回跳。
 */
function RequireAdminSession({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!readSession()) {
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
 * 后台路由：/preview/** 是工程预览命名空间。
 *
 * 批次 F 起 /preview 由 RequireAdminSession 会话守卫（未登录跳登录页并回跳）；
 * 按钮级 RBAC 仍待身份体系后续接入——导航可见性绝不等于已授权。
 *
 * 各页的标题与说明通过 <Route handle> 挂在路由上，外壳用 shell/useRouteMeta.ts 读取
 * （声明式 <Routes> 不提供 useMatches）。这样「这一页叫什么」与「这一页挂在哪条路径」
 * 写在同一处，新增页面不可能漏配。
 */
export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/preview"
        element={
          <RequireAdminSession>
            <AdminShell />
          </RequireAdminSession>
        }
      >
        <Route index element={<Navigate to="apps" replace />} />
        <Route
          path="apps"
          element={<ApplicationsPage />}
          handle={{ title: '应用列表', subtitle: '' }}
        />
        <Route
          path="publish"
          element={<PublishPage />}
          handle={{ title: '应用发布', subtitle: '' }}
        />
        <Route path="users" element={<UsersPage />} handle={{ title: '用户', subtitle: '' }} />
        <Route path="roles" element={<RolesPage />} handle={{ title: '角色', subtitle: '' }} />
        <Route
          path="organizations"
          element={<OrganizationsPage />}
          handle={{ title: '组织', subtitle: '' }}
        />
        <Route
          path="announcements"
          element={<AnnouncementsPage />}
          handle={{ title: '公告管理', subtitle: '' }}
        />
        <Route
          path="feedback"
          element={<FeedbackPage />}
          handle={{ title: '用户反馈', subtitle: '' }}
        />
        <Route
          path="roadmap"
          element={<RoadmapPage />}
          handle={{ title: '功能进展', subtitle: '' }}
        />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
