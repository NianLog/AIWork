import type { AppRegistry, MicroAppManifest } from '@ai-portal/shared-types';

/**
 * 演示态管理数据（P0-1 视觉重构期专用）。
 *
 * 负责人于 2026-09-24 授权：为呈现目标场景中的后台形态（应用注册、RBAC、组织隔离），
 * 界面可展示显式标注的演示数据。约束与门户侧一致：
 * 1. 应用记录复用 `AppRegistry` 契约，P0-3/P0-4 接真实服务时整模块删除；
 * 2. entry / backendApi 使用 RFC 2606 保留域 `.invalid`，永不解析；
 * 3. 所有增删改按钮必须禁用——后台没有 Yudao Cloud 就没有任何写路径，
 *    「能点但保存不了」比「不能点」更容易被误当成真实能力；
 * 4. 人员、角色、组织均为虚构，不含任何真实身份信息。
 *
 * 退出条件：P0-3 接入 Yudao Cloud RBAC 后删除本文件并移除演示徽章。
 */

/** 演示态统一披露文案，与门户侧保持同值；两处常量必须在同一 PR 内同步修改。 */
export const DEMO_DISCLOSURE = '体验示例 · 非真实数据';

export const DEMO_EXPLANATION =
  '这里的人员、角色、组织与应用信息都是为了展示界面效果而准备的示例，不来自真实业务系统，也不代表任何真实的人员或组织；所有保存类操作都不可用。';

const DEMO_ENTRY_ORIGIN = 'https://apps.invalid';
const DEMO_API_ORIGIN = 'https://api.invalid';

export type DemoStatus = 'active' | 'invited' | 'disabled';

/** 钉钉 Tag 预设色：success / warning / default，不使用自定义色值。 */
export type TagColor = 'success' | 'warning' | 'default';

/** 状态标签：把内部状态值翻译成业务用户看得懂的说法，并对应标签颜色。 */
export const STATUS_META: Record<DemoStatus, { label: string; tagColor: TagColor }> = {
  active: { label: '在职可用', tagColor: 'success' },
  invited: { label: '待激活', tagColor: 'warning' },
  disabled: { label: '已停用', tagColor: 'default' },
};

export interface DemoUser {
  id: string;
  name: string;
  account: string;
  orgName: string;
  roleNames: string[];
  status: DemoStatus;
  lastLoginAt: string;
}

export interface DemoRole {
  id: string;
  name: string;
  code: string;
  scope: string;
  memberCount: number;
  permissionCount: number;
  status: DemoStatus;
}

export interface DemoOrganization {
  id: string;
  name: string;
  type: string;
  parentName: string;
  memberCount: number;
  appCount: number;
  status: DemoStatus;
}

/**
 * 应用发布记录：注册接口契约 + 清单契约中的 backendApi + 发布链路展示字段。
 *
 * `AppRegistry` 不含 backendApi，但网关按 /api/{appId}/** 代理时必须知道它；
 * 这是两个 [锁定] 契约间的缺口，已记入 DDE 笔记待 P0-5 确认，此处不改类型只交叉组合。
 */
export type DemoApplicationRecord = AppRegistry &
  Pick<MicroAppManifest, 'backendApi'> & {
    channel: 'stable' | 'canary' | 'paused';
    canaryRatio?: number;
    publishedAt: string;
    ownerTeam: string;
    tileTone: 'brand' | 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
  };

/** 发布状态标签：stable 正式版 / canary 试运行 / paused 已停用。 */
export const CHANNEL_META: Record<DemoApplicationRecord['channel'], { label: string; tagColor: TagColor }> = {
  stable: { label: '正式版', tagColor: 'success' },
  canary: { label: '试运行', tagColor: 'warning' },
  paused: { label: '已停用', tagColor: 'default' },
};

export const DEMO_USERS: DemoUser[] = [
  {
    id: 'u-1001',
    name: '林知远',
    account: 'lin.zhiyuan',
    orgName: '视觉算法组',
    roleNames: ['平台管理员', '生图应用负责人'],
    status: 'active',
    lastLoginAt: '2026-09-24 09:12',
  },
  {
    id: 'u-1002',
    name: '苏念',
    account: 'su.nian',
    orgName: '直播运营部',
    roleNames: ['巡检审核员'],
    status: 'active',
    lastLoginAt: '2026-09-24 08:47',
  },
  {
    id: 'u-1003',
    name: '陈默',
    account: 'chen.mo',
    orgName: '视频渲染组',
    roleNames: ['生视频应用负责人'],
    status: 'active',
    lastLoginAt: '2026-09-23 21:05',
  },
  {
    id: 'u-1004',
    name: '周予安',
    account: 'zhou.yuan',
    orgName: 'POP 商家中心',
    roleNames: ['商家运营'],
    status: 'invited',
    lastLoginAt: '从未登录',
  },
  {
    id: 'u-1005',
    name: '何砚',
    account: 'he.yan',
    orgName: '风控平台组',
    roleNames: ['巡检审核员', '报告导出员'],
    status: 'active',
    lastLoginAt: '2026-09-24 10:31',
  },
  {
    id: 'u-1006',
    name: '吴桐',
    account: 'wu.tong',
    orgName: '内容智能组',
    roleNames: ['文案应用负责人'],
    status: 'disabled',
    lastLoginAt: '2026-08-11 16:20',
  },
  {
    id: 'u-1007',
    name: '郑亦然',
    account: 'zheng.yiran',
    orgName: '自营旗舰店',
    roleNames: ['商家运营'],
    status: 'invited',
    lastLoginAt: '从未登录',
  },
];

export const DEMO_ROLES: DemoRole[] = [
  {
    id: 'r-01',
    name: '平台管理员',
    code: 'platform:admin',
    scope: '全部组织',
    memberCount: 3,
    permissionCount: 42,
    status: 'active',
  },
  {
    id: 'r-02',
    name: '生图应用负责人',
    code: 'ai-image-gen:owner',
    scope: '视觉算法组',
    memberCount: 6,
    permissionCount: 12,
    status: 'active',
  },
  {
    id: 'r-03',
    name: '巡检审核员',
    code: 'live-inspection:reviewer',
    scope: '直播运营部',
    memberCount: 18,
    permissionCount: 7,
    status: 'active',
  },
  {
    id: 'r-04',
    name: '商家运营',
    code: 'merchant:operator',
    scope: '按商家隔离',
    memberCount: 124,
    permissionCount: 5,
    status: 'active',
  },
  {
    id: 'r-05',
    name: '外部协作者（历史）',
    code: 'external:collaborator',
    scope: '仅生图只读',
    memberCount: 0,
    permissionCount: 2,
    status: 'disabled',
  },
];

export const DEMO_ORGANIZATIONS: DemoOrganization[] = [
  {
    id: 'o-01',
    name: '平台技术中心',
    type: '一级组织',
    parentName: '—',
    memberCount: 86,
    appCount: 6,
    status: 'active',
  },
  {
    id: 'o-02',
    name: '视觉算法组',
    type: '二级组织',
    parentName: '平台技术中心',
    memberCount: 21,
    appCount: 2,
    status: 'active',
  },
  {
    id: 'o-03',
    name: '直播运营部',
    type: '二级组织',
    parentName: '平台技术中心',
    memberCount: 34,
    appCount: 1,
    status: 'active',
  },
  {
    id: 'o-04',
    name: '自营旗舰店',
    type: '商家',
    parentName: '—',
    memberCount: 57,
    appCount: 4,
    status: 'active',
  },
  {
    id: 'o-05',
    name: 'POP 商家中心',
    type: '商家',
    parentName: '—',
    memberCount: 412,
    appCount: 4,
    status: 'active',
  },
  {
    id: 'o-06',
    name: '临时协作组',
    type: '临时',
    parentName: '—',
    memberCount: 2,
    appCount: 0,
    status: 'disabled',
  },
];

export const DEMO_APPLICATIONS: DemoApplicationRecord[] = [
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
      { code: 'ai-image-gen:task:create', name: '创建生图任务', module: '任务' },
      { code: 'ai-image-gen:task:export', name: '导出成品图', module: '任务' },
      { code: 'ai-image-gen:style:read', name: '查看风格模板', module: '模板' },
    ],
    channel: 'stable',
    publishedAt: '2026-09-18 14:02',
    ownerTeam: '视觉算法组',
    tileTone: 'violet',
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
      { code: 'ai-video-gen:task:create', name: '创建任务', module: '任务' },
      { code: 'ai-video-gen:task:export', name: '导出结果', module: '任务' },
      { code: 'ai-video-gen:material:upload', name: '上传素材', module: '素材' },
    ],
    channel: 'canary',
    canaryRatio: 20,
    publishedAt: '2026-09-21 11:36',
    ownerTeam: '视频渲染组',
    tileTone: 'cyan',
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
      { code: 'live-inspection:room:read', name: '查看直播间', module: '巡检' },
      { code: 'live-inspection:risk:handle', name: '处置风险片段', module: '巡检' },
      { code: 'live-inspection:report:export', name: '导出巡检报告', module: '报告' },
    ],
    channel: 'canary',
    canaryRatio: 5,
    publishedAt: '2026-09-22 17:48',
    ownerTeam: '风控平台组',
    tileTone: 'emerald',
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
    permissions: [{ code: 'asset-vault:asset:read', name: '浏览素材', module: '资产' }],
    channel: 'paused',
    publishedAt: '2026-08-30 09:15',
    ownerTeam: '平台工程组',
    tileTone: 'slate',
  },
];

/** 演示态管理员身份，仅用于头像与身份卡；不含真实凭据。 */
export const DEMO_OPERATOR = {
  displayName: '演示管理员',
  roleLabel: '未分配角色',
  envLabel: '体验环境',
} as const;

/**
 * 四态数据视图契约（2026-09-25 批次二）：视图层只认「status + data + error」形状。
 * 演示数据永远 success；P0-3/P0-4 接 Yudao / 注册接口时换来源不改视图。
 */
export interface DataView<T> {
  status: 'loading' | 'error' | 'success';
  data: T[];
  error?: string;
}

export const DEMO_USERS_VIEW: DataView<DemoUser> = { status: 'success', data: DEMO_USERS };
export const DEMO_ROLES_VIEW: DataView<DemoRole> = { status: 'success', data: DEMO_ROLES };
export const DEMO_ORGS_VIEW: DataView<DemoOrganization> = { status: 'success', data: DEMO_ORGANIZATIONS };
export const DEMO_APPLICATIONS_VIEW: DataView<DemoApplicationRecord> = { status: 'success', data: DEMO_APPLICATIONS };
