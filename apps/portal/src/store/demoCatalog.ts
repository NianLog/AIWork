import type { AppRegistry, MicroAppManifest, MicroAppPermission } from '@ai-portal/shared-types';

/**
 * 演示态应用目录（P0-1 视觉重构期专用）。
 *
 * 为什么存在：引导文档 §1.1 的目标场景是「AI 生图 / 生视频 / 直播巡检」工具集，
 * 但 P0-1 阶段没有应用注册服务，真实列表只能为空。负责人于 2026-09-24 授权
 * 用显式标注的演示数据呈现目标场景形态，条件是所有演示内容必须可被一眼识别为非真实。
 *
 * 三条不可破的约束（测试会逐条断言）：
 * 1. 数据结构复用 `AppRegistry`（§5.1 / 注册接口契约），P0-4 接真实接口时整模块删除即可，
 *    页面组件不需要改形状。
 * 2. `entry` / `backendApi` 一律使用 RFC 2606 保留域 `.invalid`，该顶级域永不解析，
 *    因此演示卡片即便被误当成真实链接也不可能打到任何后端或 CDN。
 * 3. 本模块不是应用白名单：它只喂给界面渲染，容器层不得读取它来挂载子应用
 *    （§5.2 [锁定]「主应用不持有任何子应用白名单」）。
 *
 * 退出条件：P0-4 容器适配层接入真实注册接口后删除本文件，并移除界面上的演示徽章。
 */

/** 演示态统一披露文案（短标签，用于顶部提示条与各处徽章）；测试按此常量断言。 */
export const DEMO_DISCLOSURE = '体验示例 · 非真实数据';

/** 非登录态说明，与披露标签拼在提示条里。 */
export const DEMO_SESSION_LABEL = '无需登录';

/** 演示态长说明，用于详情抽屉与各页说明文案。 */
export const DEMO_EXPLANATION =
  '这里的应用信息是为了展示界面效果而准备的示例，并不来自正式的应用清单，目前也无法从界面直接打开使用。';

/** 演示入口域：RFC 2606 保留，永不解析。 */
const DEMO_ENTRY_ORIGIN = 'https://apps.invalid';
const DEMO_API_ORIGIN = 'https://api.invalid';

/** 演示态在契约之外的展示字段，仅用于界面呈现。 */
export interface DemoAppPresentation {
  /** 应用市场分类 */
  category: string;
  /** 一句话简介 */
  summary: string;
  /** 负责团队 */
  ownerTeam: string;
  /** 发布通道：stable 全量 / canary 灰度 / paused 已停用 */
  channel: 'stable' | 'canary' | 'paused';
  /** 灰度比例，仅 canary 有意义 */
  canaryRatio?: number;
  /** 演示用的近 7 日调用量，仅用于图表观感 */
  weeklyCalls: number[];
  /** 图标瓦片配色，取值见 styles.css 的 .portal-appicon--* 修饰类 */
  tileTone: 'brand' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
  /** 图标标识，由界面层映射到内联 SVG */
  iconKey: 'image' | 'video' | 'radar' | 'sparkles' | 'layers' | 'zap';
  /** 最近更新时间（演示用固定值，避免每次渲染变化导致快照抖动） */
  updatedAt: string;
}

/**
 * 演示态应用 = 注册接口契约 + 清单契约中的 backendApi + 界面展示字段。
 *
 * 为什么不是单一类型：shared-types 里 `AppRegistry`（注册接口返回）不含 backendApi，
 * 而 `MicroAppManifest`（子应用清单）不含 entry/status/icon。网关要按 appId 代理
 * /api/{appId}/**，就必须知道 backendApi，但注册契约里没有这个字段——
 * 这是两个 [锁定] 契约之间的一处缺口，已记入 DDE 笔记待 P0-5 与负责人确认，
 * 本模块不做任何类型改动，只按需交叉组合。
 */
export type DemoApp = AppRegistry & Pick<MicroAppManifest, 'backendApi'> & DemoAppPresentation;

function permission(
  appId: string,
  resource: string,
  action: string,
  name: string,
  module: string,
  description?: string,
): MicroAppPermission {
  return { code: `${appId}:${resource}:${action}`, name, module, description };
}

export const DEMO_APPS: DemoApp[] = [
  {
    appId: 'ai-image-gen',
    name: 'AI 商品图生成',
    version: '1.4.0',
    framework: 'react',
    baseRoute: '/ai-image',
    backendApi: `${DEMO_API_ORIGIN}/ai-image-gen`,
    entry: `${DEMO_ENTRY_ORIGIN}/ai-image-gen/1.4.0/index.html`,
    sandbox: 'iframe',
    status: 1,
    permissions: [
      permission('ai-image-gen', 'task', 'create', '创建生图任务', '任务'),
      permission('ai-image-gen', 'task', 'export', '导出成品图', '任务'),
      permission('ai-image-gen', 'style', 'read', '查看风格模板', '模板'),
    ],
    category: 'AI 生图',
    summary: '按商品类目批量生成主图、场景图与白底图，支持风格模板与品牌色约束。',
    ownerTeam: '视觉算法组',
    channel: 'stable',
    weeklyCalls: [820, 932, 901, 1290, 1330, 1520, 1410],
    tileTone: 'violet',
    iconKey: 'image',
    updatedAt: '2026-09-18',
  },
  {
    appId: 'ai-video-gen',
    name: 'AI 商品视频生成',
    version: '1.2.0',
    framework: 'vue3',
    baseRoute: '/ai-video',
    backendApi: `${DEMO_API_ORIGIN}/render`,
    entry: `${DEMO_ENTRY_ORIGIN}/ai-video-gen/1.2.0/index.html`,
    sandbox: 'iframe',
    status: 1,
    permissions: [
      permission('ai-video-gen', 'task', 'create', '创建任务', '任务'),
      permission('ai-video-gen', 'task', 'export', '导出结果', '任务'),
      permission('ai-video-gen', 'material', 'upload', '上传素材', '素材'),
    ],
    category: 'AI 生视频',
    summary: '商品图转短视频，含口播文案、字幕与配乐，产出可直接投放的尺寸规格。',
    ownerTeam: '视频渲染组',
    channel: 'canary',
    canaryRatio: 20,
    weeklyCalls: [420, 510, 488, 640, 705, 690, 812],
    tileTone: 'cyan',
    iconKey: 'video',
    updatedAt: '2026-09-21',
  },
  {
    appId: 'live-inspection',
    name: '直播巡检助手',
    version: '0.9.2',
    framework: 'vue3',
    baseRoute: '/live-inspection',
    backendApi: `${DEMO_API_ORIGIN}/live-inspection`,
    entry: `${DEMO_ENTRY_ORIGIN}/live-inspection/0.9.2/index.html`,
    sandbox: 'default',
    status: 1,
    permissions: [
      permission('live-inspection', 'room', 'read', '查看直播间', '巡检'),
      permission('live-inspection', 'risk', 'handle', '处置风险片段', '巡检'),
      permission('live-inspection', 'report', 'export', '导出巡检报告', '报告'),
    ],
    category: '直播巡检',
    summary: '实时识别违规话术与画面风险，按场次生成巡检报告与处置建议。',
    ownerTeam: '风控平台组',
    channel: 'canary',
    canaryRatio: 5,
    weeklyCalls: [1200, 1180, 1402, 1355, 1610, 1588, 1720],
    tileTone: 'emerald',
    iconKey: 'radar',
    updatedAt: '2026-09-22',
  },
  {
    appId: 'ai-copywriting',
    name: 'AI 商品文案',
    version: '2.0.1',
    framework: 'react',
    baseRoute: '/ai-copy',
    backendApi: `${DEMO_API_ORIGIN}/ai-copywriting`,
    entry: `${DEMO_ENTRY_ORIGIN}/ai-copywriting/2.0.1/index.html`,
    sandbox: 'iframe',
    status: 1,
    permissions: [
      permission('ai-copywriting', 'draft', 'create', '生成文案草稿', '创作'),
      permission('ai-copywriting', 'draft', 'publish', '发布到商品', '创作'),
    ],
    category: 'AI 文本',
    summary: '标题、卖点与详情页文案生成，接入品牌词库与合规敏感词过滤。',
    ownerTeam: '内容智能组',
    channel: 'stable',
    weeklyCalls: [640, 702, 688, 760, 803, 921, 880],
    tileTone: 'brand',
    iconKey: 'sparkles',
    updatedAt: '2026-09-12',
  },
  {
    appId: 'asset-vault',
    name: '素材资产库',
    version: '0.6.0',
    framework: 'vanilla',
    baseRoute: '/assets',
    backendApi: `${DEMO_API_ORIGIN}/asset-vault`,
    entry: `${DEMO_ENTRY_ORIGIN}/asset-vault/0.6.0/index.html`,
    sandbox: 'default',
    status: 0,
    permissions: [permission('asset-vault', 'asset', 'read', '浏览素材', '资产')],
    category: '基础工具',
    summary: '统一存放图片、视频与模型素材，为生图生视频提供输入源。',
    ownerTeam: '平台工程组',
    channel: 'paused',
    weeklyCalls: [0, 0, 0, 0, 0, 0, 0],
    tileTone: 'slate',
    iconKey: 'layers',
    updatedAt: '2026-08-30',
  },
  {
    appId: 'model-tryon',
    name: 'AI 模特试穿',
    version: '0.3.4',
    framework: 'svelte',
    baseRoute: '/tryon',
    backendApi: `${DEMO_API_ORIGIN}/model-tryon`,
    entry: `${DEMO_ENTRY_ORIGIN}/model-tryon/0.3.4/index.html`,
    sandbox: 'iframe',
    status: 1,
    permissions: [
      permission('model-tryon', 'render', 'create', '发起试穿渲染', '渲染'),
      permission('model-tryon', 'model', 'read', '查看模特库', '模特'),
    ],
    category: 'AI 生图',
    summary: '服饰类商品的虚拟试穿，支持多体型模特与面料垂感模拟。',
    ownerTeam: '视觉算法组',
    channel: 'stable',
    weeklyCalls: [310, 355, 402, 388, 460, 501, 478],
    tileTone: 'rose',
    iconKey: 'zap',
    updatedAt: '2026-09-15',
  },
];

/** 演示态组织列表，仅用于顶栏组织切换器的视觉呈现。 */
export const DEMO_ORGANIZATIONS = ['全部组织', '自营旗舰店', 'POP 商家中心', '直播运营部'] as const;

/** 演示态当前用户，仅用于头像与身份卡呈现；不含任何真实身份信息。 */
export const DEMO_VIEWER = {
  displayName: '演示访客',
  roles: ['未分配角色'],
  orgLabel: '全部组织',
} as const;

/** 按状态与关键词过滤演示目录，供应用市场的检索与分段筛选使用。 */
export function filterDemoApps(keyword: string, channel: 'all' | DemoAppPresentation['channel']): DemoApp[] {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return DEMO_APPS.filter((app) => {
    const matchesChannel = channel === 'all' || app.channel === channel;
    if (!matchesChannel) {
      return false;
    }
    if (!normalizedKeyword) {
      return true;
    }
    const haystack = [app.name, app.appId, app.category, app.summary, app.ownerTeam]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedKeyword);
  });
}

/** 演示用统计：由演示目录派生，避免手写与列表不一致的数字。 */
export function summarizeDemoApps() {
  const enabled = DEMO_APPS.filter((app) => app.status === 1);
  const canary = DEMO_APPS.filter((app) => app.channel === 'canary');
  const permissionTotal = DEMO_APPS.reduce((sum, app) => sum + app.permissions.length, 0);
  return {
    total: DEMO_APPS.length,
    enabled: enabled.length,
    canary: canary.length,
    permissionTotal,
  };
}
