import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, Grid, Tag } from 'dingtalk-design-mobile';
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
 */
export default function WorkbenchPage() {
  const [activeApp, setActiveApp] = useState<DemoApp | null>(null);
  const stats = summarizeDemoApps();
  const enabledApps = useMemo(() => DEMO_APPS.filter((app) => app.status === 1), []);

  const gridData = useMemo(
    () =>
      enabledApps.map((app) => ({
        app,
        icon: <AppIconTile app={app} />,
        text: app.name,
      })),
    [enabledApps],
  );

  return (
    <>
      <section className="portal-card portal-greeting" aria-label="欢迎信息">
        <div className="portal-greeting__text">
          <p className="portal-greeting__title">你好，{DEMO_VIEWER.displayName}</p>
          <p className="portal-greeting__sub">
            共 {stats.enabled} 个应用可用，其中 {stats.canary} 个正在小范围试运行
          </p>
        </div>
        <Tag size="small" color="primary" fill="outline">
          {DEMO_DISCLOSURE}
        </Tag>
      </section>

      <section className="portal-section" aria-label="常用应用">
        <div className="portal-section__head">
          <h2 className="portal-section__title">常用应用</h2>
          <Link className="portal-section__link" to="/preview/market">
            全部应用
            <RightArrowOutlined style={{ fontSize: 12 }} />
          </Link>
        </div>
        <div className="portal-card">
          <Grid
            data={gridData}
            columnNum={4}
            onClick={(item) => {
              const app = (item as { app?: DemoApp } | undefined)?.app;
              if (app) {
                setActiveApp(app);
              }
            }}
          />
        </div>
      </section>

      <section className="portal-section" aria-label="使用数据">
        <div className="portal-section__head">
          <h2 className="portal-section__title">使用数据</h2>
        </div>
        <div className="portal-card">
          <Empty type="noContent" title="暂无使用数据" inline />
          <p className="portal-note-text">
            使用数据会在功能正式上线后展示。现在不提供任何示例数字，避免被误认为真实统计。
          </p>
        </div>
      </section>

      {activeApp ? <AppDetailDrawer app={activeApp} onClose={() => setActiveApp(null)} /> : null}
    </>
  );
}