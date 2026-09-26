import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Empty } from 'dingtalk-design-mobile';
import { RightArrowOutlined } from 'dd-icons';
import { useAppRegistryStore, summarizeApps } from '../../store/appRegistryStore';
import { useSessionStore } from '../../store/sessionStore';
import { PORTAL_ENV_LABEL } from '../../store/portalNotice';
import { summarizeRoadmap } from '../../store/roadmap';
import AppDetailDrawer from '../parts/AppDetailDrawer';
import { AppIconTile } from '../parts/AppVisuals';
import { deriveVisual } from '../../store/appRegistryStore';

/**
 * 工作台：门户首屏（问候 + 应用宫格 + 进展速览）。
 *
 * 批次 C（P0-4）起应用宫格来自注册表接口：页面挂载即拉取（in-flight 去重），
 * 管理端新增配置不需要重启门户就能在这里出现（C1 验收路径）。
 * 四态视图形状不变（DataView），事实源从演示目录换成接口。
 *
 * 问候对象随登录态：未登录显示「访客」，登录后显示账号昵称。
 * 两个统计数字由清单派生，不与列表分开维护。
 */
export default function WorkbenchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useAppRegistryStore((state) => state.view);
  const needsLogin = useAppRegistryStore((state) => state.needsLogin);
  const session = useSessionStore((state) => state.session);
  const roadmap = useMemo(() => summarizeRoadmap(), []);

  useEffect(() => {
    void useAppRegistryStore.getState().fetch();
  }, []);

  const stats = useMemo(() => summarizeApps(view.data), [view.data]);
  /** 选中态即 URL：?app=xxx 打开抽屉（推历史），清除参数关闭（replace） */
  const activeAppId = searchParams.get('app');
  const activeApp = activeAppId
    ? view.data.find((app) => app.appId === activeAppId) ?? null
    : null;

  return (
    <div className="ui-page portal-page--workbench">
      <section className="portal-hero" aria-label="欢迎信息">
        <div className="portal-hero__main">
          <h2 className="portal-hero__title">你好，{session?.user.nickname ?? '访客'}</h2>
          <p className="portal-hero__sub">AI 工具，一个入口全部搞定。</p>
        </div>
        <dl className="portal-hero__stats">
          <div className="portal-hero__stat">
            <dt>可用应用</dt>
            <dd className="ui-num">{stats.total}</dd>
          </div>
          <div className="portal-hero__stat">
            <dt>小范围试运行</dt>
            <dd className="ui-num">{stats.canary}</dd>
          </div>
        </dl>
        <span className="ui-badge ui-badge--outline portal-hero__badge">{PORTAL_ENV_LABEL}</span>
      </section>

      <section className="ui-section" aria-label="常用应用">
        <div className="ui-section__head">
          <h2 className="ui-section__title">常用应用</h2>
          <Link className="ui-section__link" to="/preview/market">
            全部应用
            <span aria-hidden="true">
              <RightArrowOutlined style={{ fontSize: 12 }} />
            </span>
          </Link>
        </div>
        {needsLogin ? (
          <div className="ui-card ui-card--center">
            <Empty title="登录后查看应用" inline />
            <p className="ui-note">应用清单需要登录后获取。</p>
            <Button size="large" inline={false} onClick={() => navigate('/login')}>
              去登录
            </Button>
          </div>
        ) : view.status === 'loading' ? (
          <ul className="portal-grid" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <li key={index} className="portal-grid__skel">
                <span className="ui-skeleton ui-skeleton--tile" />
                <span className="ui-skeleton ui-skeleton--line" />
              </li>
            ))}
          </ul>
        ) : view.status === 'error' ? (
          <div className="ui-card ui-card--center">
            <div className="ui-errorstate" role="alert">
              <h2 className="ui-errorstate__title">无法加载常用应用</h2>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button size="large" onClick={() => void useAppRegistryStore.getState().fetch()}>
                  重试
                </Button>
              </div>
            </div>
          </div>
        ) : view.data.length > 0 ? (
          <ul className="portal-grid">
            {view.data.map((app) => (
              <li key={app.appId}>
                <button
                  type="button"
                  className="portal-grid__tile"
                  onClick={() => setSearchParams({ app: app.appId })}
                >
                  <AppIconTile visual={deriveVisual(app.appId)} />
                  <span className="portal-grid__name">{app.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ui-card ui-card--center">
            <Empty title="还没有可用的应用" inline />
            <p className="ui-note">应用在管理端配置并启用后，会自动出现在这里。</p>
          </div>
        )}
      </section>

      <section className="ui-section" aria-label="功能进展速览">
        <div className="ui-section__head">
          <h2 className="ui-section__title">功能进展速览</h2>
          <Link className="ui-section__link" to="/preview/status">
            去看功能进展
            <span aria-hidden="true">
              <RightArrowOutlined style={{ fontSize: 12 }} />
            </span>
          </Link>
        </div>
        <div className="portal-roadmap">
          {roadmap.map((stage) => (
            <div className="portal-roadmap__card" key={stage.key}>
              <p className="portal-roadmap__count ui-num">{stage.count}</p>
              <p className="portal-roadmap__title">{stage.title}</p>
              <p className="portal-roadmap__summary">{stage.summary}</p>
            </div>
          ))}
        </div>
      </section>

      {activeApp ? (
        <AppDetailDrawer app={activeApp} onClose={() => setSearchParams({}, { replace: true })} />
      ) : null}
    </div>
  );
}
