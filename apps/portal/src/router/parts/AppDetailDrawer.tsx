import { useEffect } from 'react';
import { Button, Drawer, List, NoticeBar } from 'dingtalk-design-mobile';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION } from '../../store/demoCatalog';
import type { DemoApp } from '../../store/demoCatalog';
import { AppIconTile, AppStatusTag } from './AppVisuals';

/**
 * 应用详情抽屉：只展示业务用户关心的信息（状态、版本、负责团队与可用功能）。
 *
 * 「打开应用」按钮永久禁用并说明原因——应用容器尚未接入前，界面里不存在任何
 * 可以跳转到子应用的路径；打开应用属于写意图操作，必须保持不可用，测试会断言
 * 它既声明 aria-disabled，点击后也不产生任何跳转。
 */
export default function AppDetailDrawer({ app, onClose }: { app: DemoApp; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <Drawer
      visible
      position="bottom"
      height="82%"
      title={app.name}
      subTitle={`${app.category} · ${app.ownerTeam}`}
      onClose={onClose}
    >
      <div className="portal-detail" role="dialog" aria-modal="true" aria-label={`${app.name} 应用详情`}>
        <div className="portal-detail__head">
          <AppIconTile app={app} />
          <div>
            <p className="portal-detail__head-name">{app.name}</p>
            <p className="portal-detail__head-sub">{app.summary}</p>
          </div>
        </div>

        <div className="portal-detail__note" role="note" aria-label="体验示例说明">
          <NoticeBar text={DEMO_DISCLOSURE} />
          <p className="portal-detail__note-text">{DEMO_EXPLANATION}</p>
        </div>

        <List>
          <List.Item extra={<AppStatusTag app={app} />}>使用状态</List.Item>
          <List.Item extra={`v${app.version}`}>版本</List.Item>
          <List.Item extra={app.category}>分类</List.Item>
          <List.Item extra={app.ownerTeam}>负责团队</List.Item>
          <List.Item extra={app.updatedAt}>最近更新</List.Item>
        </List>

        <h2 className="portal-detail__section-title">可用功能（{app.permissions.length}）</h2>
        <List>
          {app.permissions.map((item) => (
            <List.Item key={item.code} brief={item.description}>
              {item.name}
            </List.Item>
          ))}
        </List>

        <div className="portal-detail__foot">
          <Button type="primary" size="large" inline={false} disabled>
            打开应用（暂不可用）
          </Button>
          <Button size="large" inline={false} onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Drawer>
  );
}