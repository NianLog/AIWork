import { useLocation } from 'react-router-dom';

/**
 * 从当前地址解析页面标题与说明。
 *
 * 为什么需要这个小 hook：声明式 <Routes> 不提供 useMatches()，页头又想跟着路由走。
 * 折中办法是「用路由表当匹配源」——外壳把 <Route handle> 上的同一份数据传进来，
 * 而不是另写一张按 pathname 手写 if/else 的表。两者仍然要一起改，但至少数据只有一份，
 * 新增路由时忘记同步的表现是标题缺失（立刻看得见），而不是静默显示上一页的标题。
 *
 * 匹配规则：取最后一条命中的项（数组顺序即优先级，把更具体的路径写在后面）。
 * `path` 用前缀匹配，因此 '/preview' 这种父路径也能兜住它的子路由。
 */
export interface RouteMeta {
  /** 前缀匹配用的路径，与路由表里的 path 保持一致 */
  path: string;
  title: string;
  subtitle: string;
}

export function useRouteMeta<T extends RouteMeta>(metas: readonly T[], fallback: T): T {
  const { pathname } = useLocation();

  const matched = [...metas]
    .filter((meta) => pathname === meta.path || pathname.startsWith(`${meta.path}/`))
    .pop();

  return matched ?? fallback;
}