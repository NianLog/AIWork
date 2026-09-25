import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RightArrowOutlined } from 'dd-icons';
import { DEMO_APPS, DEMO_DISCLOSURE, DEMO_VIEWER, summarizeDemoApps } from '../../store/demoCatalog';
import type { DemoApp } from '../../store/demoCatalog';
import AppDetailDrawer from '../parts/AppDetailDrawer';
import { AppIconTile } from '../parts/AppVisuals';

/**
 * 工作台：门户首屏，对标钉钉工作台的信息结构（问候 + 应用宫格 + 说明区块）。
 *
 * 宫格只打开详情抽屉，不产生任何指向子应用的导航——应用容器接入前这条路径必须不存在。
 * 界面不展示应用标识、技术框架、权限码等实现细节，只保留业务用户关心的信息。
 *
 * 版式取舍：
 * - 问候与两个关键数字合成一张卡，右侧跟一句披露标签；以前是「问候卡 + 空的使用数据卡」
 *   两张几乎等高的卡上下堆叠，首屏一半面积在讲「现在没有数据」；
 * - 宫格改成自适应的响应式网格（每列最小 88px），不再按断点手算列数，
 *   宽屏自然铺到 8 列，窄屏 3 列，中间尺寸也不会出现 4 列挤成一团的情况；
 * - 「使用数据」保留空态说明，但收成一张矮卡并挪到宫格之后，不再占据首屏另一半。
 */
export default function WorkbenchPage() {
  const [activeApp, setActiveApp] = useState<DemoApp | null>(null);
  const stats = summarizeDemoApps();
  const enabledApps = useMemo(() => DEMO_APPS.filter((app) => app.status === 1), []);

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
            <RightArrowOutlined style={{ fontSize: 12 }} />
          </Link>
        </div>
        <ul className="portal-grid">
          {enabledApps.map((app) => (
            <li key={app.appId}>
              <button
                type="button"
                className="portal-grid__tile"
                onClick={() => setActiveApp(app)}
              >
                <AppIconTile app={app} />
                <span className="portal-grid__name">{app.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-section" aria-label="使用数据">
        <div className="ui-section__head">
          <h2 className="ui-section__title">使用数据</h2>
        </div>
        <div className="ui-card">
          <p className="ui-note ui-note--tight portal-empty-note">
            使用数据会在功能正式上线后展示。现在不提供任何示例数字，避免被误认为真实统计。
          </p>
        </div>
      </section>

      {activeApp ? <AppDetailDrawer app={activeApp} onClose={() => setActiveApp(null)} /> : null}
    </div>
  );
}