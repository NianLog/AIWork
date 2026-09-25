import type { ReactNode } from 'react';
import {
  AppletOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  RadarOutlined,
  VideoOutlined,
  WriteEditOutlined,
} from 'dd-icons';
import type { DemoApp } from '../../store/demoCatalog';

/**
 * 演示应用的视觉辅助件：图标瓦片与状态标签。
 *
 * 只呈现业务字段（名称、分类与状态的通俗说法），不展示应用标识、技术框架、
 * 沙箱、路由或权限码等实现细节；应用入口等地址一律不渲染，界面上不存在任何
 * 指向子应用的链接。
 */

const APP_ICONS: Record<DemoApp['iconKey'], ReactNode> = {
  image: <PictureOutlined />,
  video: <VideoOutlined />,
  radar: <RadarOutlined />,
  sparkles: <WriteEditOutlined />,
  layers: <FolderOpenOutlined />,
  zap: <AppletOutlined />,
};

/** 色调映射：与 ui-tokens/components.css 里的 .ui-tone-* 一一对应，色值只在令牌里写一次。 */
const TONE_CLASS: Record<DemoApp['tileTone'], string> = {
  brand: '',
  violet: 'ui-tone-violet',
  cyan: 'ui-tone-cyan',
  emerald: 'ui-tone-emerald',
  amber: 'ui-tone-amber',
  rose: 'ui-tone-rose',
  slate: 'ui-tone-slate',
};

export function AppIconTile({
  app,
  size = 'm',
}: {
  app: DemoApp;
  size?: 's' | 'm' | 'l';
}) {
  return (
    <span
      className={`ui-tile ui-tile--${size} ${TONE_CLASS[app.tileTone]}`.trim()}
      aria-hidden="true"
    >
      {APP_ICONS[app.iconKey]}
    </span>
  );
}

/** 状态标签：把发布通道翻译成业务用户能直接看懂的三种描述。 */
export function AppStatusTag({ app }: { app: DemoApp }) {
  if (app.status !== 1 || app.channel === 'paused') {
    return <span className="ui-badge">已停用</span>;
  }
  if (app.channel === 'canary') {
    return <span className="ui-badge ui-badge--warning">试运行</span>;
  }
  return <span className="ui-badge ui-badge--success">正式版</span>;
}