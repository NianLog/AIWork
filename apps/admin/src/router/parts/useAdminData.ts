import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../api/yudao';
import type { DataView } from '../../store/domain';

/**
 * 五页统一的数据装载 hook（批次 H）：view 四态 + reload + 401 跳登录 + 竞态取消。
 *
 * 收敛自 ApplicationsPage 的既有模式（批次 B/C 已验收的行为原样搬移）：
 * - 挂载即拉取；reload() 触发重拉（页面把「刷新」按钮和写操作成功后的刷新都指向它）；
 * - 401（request 底座已把 HTTP 401 与业务 code 401 归一）静默刷新失败后如实抛出，
 *   这里统一跳登录页并带 expired 标记与来路（批次 F 的守卫语义由跳转闭环，
 *   登录页据此提示「登录状态已过期」并在成功后回跳原页面）；
 * - 卸载后到达的响应直接丢弃（cancelled），避免路由切换后 setState 到已卸载页面；
 * - fetcher 经 ref 传递，页面传内联箭头函数不会造成重复拉取。
 */
export function useAdminData<T>(fetcher: () => Promise<T[]>): {
  view: DataView<T>;
  reload: () => void;
} {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<DataView<T>>({ status: 'loading', data: [] });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setView((prev) => ({ ...prev, status: 'loading' }));
    fetcherRef
      .current()
      .then((data) => {
        if (!cancelled) setView({ status: 'success', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.code === 401) {
          navigate('/login', {
            replace: true,
            state: { from: location.pathname + location.search, expired: true },
          });
          return;
        }
        setView({
          status: 'error',
          data: [],
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tick, navigate, location.pathname, location.search]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { view, reload };
}
