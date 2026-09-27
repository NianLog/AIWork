import type { ReactNode } from 'react';
import {
  AppletOutlined,
  FolderOpenOutlined,
  PictureOutlined,
  RadarOutlined,
  VideoOutlined,
  WriteEditOutlined,
} from 'dd-icons';
import type { AppChannel, IconKey, TileTone } from '../../store/appRegistryStore';

/**
 * 应用视觉辅助件：图标瓦片与状态标签（批次 C 起吃注册表派生的轻形状，
 * 不再依赖演示目录的整条应用记录）。
 *
 * 只呈现业务字段（名称与状态的通俗说法），不展示应用标识、技术框架、
 * 沙箱、路由或权限码等实现细节；应用入口等地址一律不渲染。
 */

export interface AppVisual {
  iconKey: IconKey;
  tileTone: TileTone;
}

const APP_ICONS: Record<IconKey, ReactNode> = {
  image: <PictureOutlined />,
  video: <VideoOutlined />,
  radar: <RadarOutlined />,
  sparkles: <WriteEditOutlined />,
  layers: <FolderOpenOutlined />,
  zap: <AppletOutlined />,
};

/** 色调映射：与 ui-tokens/components.css 里的 .ui-tone-* 一一对应，色值只在令牌里写一次。 */
const TONE_CLASS: Record<TileTone, string> = {
  brand: '',
  violet: 'ui-tone-violet',
  cyan: 'ui-tone-cyan',
  emerald: 'ui-tone-emerald',
  amber: 'ui-tone-amber',
  rose: 'ui-tone-rose',
  slate: 'ui-tone-slate',
};

export function AppIconTile({ visual, size = 'm' }: { visual: AppVisual; size?: 's' | 'm' | 'l' }) {
  return (
    <span
      className={`ui-tile ui-tile--${size} ${TONE_CLASS[visual.tileTone]}`.trim()}
      aria-hidden="true"
    >
      {APP_ICONS[visual.iconKey]}
    </span>
  );
}

/** 状态标签：把发布通道翻译成业务用户能直接看懂的说法（停用应用不会进门户清单）。 */
export function AppStatusTag({ channel }: { channel: AppChannel }) {
  if (channel === 'canary') {
    return <span className="ui-badge ui-badge--warning">试运行</span>;
  }
  return <span className="ui-badge ui-badge--success">正式版</span>;
}
