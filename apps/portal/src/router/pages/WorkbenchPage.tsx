import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Empty } from 'dingtalk-design-mobile';
import { RightArrowOutlined } from 'dd-icons';
import { DEMO_APPS_VIEW, DEMO_DISCLOSURE, DEMO_VIEWER, summarizeDemoApps } from '../../store/demoCatalog';
import { summarizeRoadmap } from '../../store/roadmap';
import AppDetailDrawer from '../parts/AppDetailDrawer';
import { AppIconTile } from '../parts/AppVisuals';

/**
 * 工作台：门户首屏，对标钉钉工作台的信息结构（问候 + 应用宫格 + 进展速览）。
 *
 * 四态骨架（批次二）：页面只认 DEMO_APPS_VIEW 的「status + data + error」形状，
 * 演示数据永远 success，loading / error 由测试喂形状覆盖。
 * 选中态进 URL（批次二）：宫格点开的详情抽屉由 ?app=<appId> 驱动，
 * 浏览器返回键 = 关抽屉，详情可深链。
 *
 * 版式取舍：
 * - 问候与两个关键数字合成一张卡，右侧跟一句披露标签；
 * - 宫格是自适应的响应式网格（每列最小 84px），宽屏自然铺开，窄屏 3 列；
 * - 下半页（批次四）：原来是一张「使用数据会在上线后展示」的空说明卡，
 *   首屏下半部大面积讲「现在没有数据」。换成「功能进展速览」——与功能进展页
 *   同一份数据（store/roadmap.ts），三张阶段卡把「上重下空」填掉，
 *   且不编造任何运行数据（使用数据仍等真实来源，见功能进展页的承诺）。
 */
export default function WorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const view = DEMO_APPS_VIEW;
  const stats = summarizeDemoApps();
  const roadmap = useMemo(() => summarizeRoadmap(), []);
  const enabledApps = useMemo(() => view.data.filter((app) => app.status === 1), [view.data]);

  /** 选中态即 URL：?app=xxx 打开抽屉（推历史），清除参数关闭（replace） */
  const activeAppId = searchParams.get('app');
  const activeApp = activeAppId
    ? view.data.find((app) => app.appId === activeAppId) ?? null
    : null;

  return (
    <div className="ui-page portal-page--workbench">
      <section className="portal-hero" aria-label="欢迎信息">
        <div className="portal-hero__main">
          <h2 className="portal-hero__title">你好，{DEMO_VIEWER.displayName}</h2>
          <p className="portal-hero__sub">AI 工具，一个入口全部搞定。</p>
        </div>
        <dl className="portal-hero__stats">
          <div className="portal-hero__stat">
            <dt>可用应用</dt>
            <dd className="ui-num">{stats.enabled}</dd>
          </div>
          <div className="portal-hero__stat">
            <dt>小范围试运行</dt>
            <dd className="ui-num">{stats.canary}</dd>
          </div>
        </dl>
        <span className="ui-badge ui-badge--outline portal-hero__badge">{DEMO_DISCLOSURE}</span>
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
        {view.status === 'loading' ? (
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
                <Button size="large" onClick={() => window.location.reload()}>
                  重试
                </Button>
              </div>
            </div>
          </div>
        ) : enabledApps.length > 0 ? (
          <ul className="portal-grid">
            {enabledApps.map((app) => (
              <li key={app.appId}>
                <button
                  type="button"
                  className="portal-grid__tile"
                  onClick={() => setSearchParams({ app: app.appId })}
                >
                  <AppIconTile app={app} />
                  <span className="portal-grid__name">{app.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ui-card ui-card--center">
            <Empty title="还没有可用的应用" inline />
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
