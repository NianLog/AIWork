import type { ReactNode } from 'react';
import { Tag } from 'dingtalk-design-mobile';
import {
  FaceOutlined,
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
  zap: <FaceOutlined />,
};

const TONE_CLASS: Record<DemoApp['tileTone'], string> = {
  brand: '',
  violet: 'portal-appicon--violet',
  cyan: 'portal-appicon--cyan',
  emerald: 'portal-appicon--emerald',
  amber: 'portal-appicon--amber',
  rose: 'portal-appicon--rose',
  slate: 'portal-appicon--slate',
};

export function AppIconTile({ app, size = 'md' }: { app: DemoApp; size?: 'md' | 'sm' }) {
  return (
    <span
      className={`portal-appicon ${TONE_CLASS[app.tileTone]} ${
        size === 'sm' ? 'portal-appicon--sm' : ''
      }`.trim()}
      aria-hidden="true"
    >
      {APP_ICONS[app.iconKey]}
    </span>
  );
}

/** 状态标签：把发布通道翻译成业务用户能直接看懂的三种描述。 */
export function AppStatusTag({ app }: { app: DemoApp }) {
  if (app.status !== 1 || app.channel === 'paused') {
    return (
      <Tag size="small" color="default">
        已停用
      </Tag>
    );
  }
  if (app.channel === 'canary') {
    return (
      <Tag size="small" color="warning" fill="outline">
        试运行
      </Tag>
    );
  }
  return (
    <Tag size="small" color="success" fill="outline">
      正式版
    </Tag>
  );
}