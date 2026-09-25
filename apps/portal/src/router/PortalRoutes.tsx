import { Navigate, Route, Routes } from 'react-router-dom';
import PortalShell from '../shell/PortalShell';
import LoginPage from './pages/LoginPage';
import MarketPage from './pages/MarketPage';
import NotFoundPage from './pages/NotFoundPage';
import StatusPage from './pages/StatusPage';
import SubAppWorkspace from './pages/SubAppWorkspace';
import WorkbenchPage from './pages/WorkbenchPage';

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
      <Route path="/preview" element={<PortalShell />}>
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
      </Route>
      {/* 子应用工作区：全屏接管，不套 PortalShell */}
      <Route path="/apps/:appId/*" element={<SubAppWorkspace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}