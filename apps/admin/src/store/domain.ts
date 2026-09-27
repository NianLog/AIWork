/**
 * 管理域共享类型与翻译表（批次 H，2026-09-27）。
 *
 * demoDirectory 退役后的中性归所：四态视图契约（2026-09-25 批次二锁定，
 * 「status + data + error」形状，视图层不认别的）与状态/通道翻译表。
 * 行类型（UserRow/RoleRow 等）与各自的 fetch 函数同址住在 api/yudao.ts。
 */

/** 四态数据视图契约：视图层只认这个形状（沿用批次二锁定的契约）。 */
export interface DataView<T> {
  status: 'loading' | 'error' | 'success';
  data: T[];
  error?: string;
}

/** 钉钉 Tag 预设色：success / warning / default，不使用自定义色值。 */
export type TagColor = 'success' | 'warning' | 'default';

/** 后端 CommonStatus（批次 C 起全链同一口径）：0=启用 1=停用。 */
export type CommonStatus = 0 | 1;

/** 用户页状态标签：人员语境说「在职可用 / 已停用」。 */
export const USER_STATUS_META: Record<CommonStatus, { label: string; tagColor: TagColor }> = {
  0: { label: '在职可用', tagColor: 'success' },
  1: { label: '已停用', tagColor: 'default' },
};

/** 角色 / 组织 / 应用页状态标签：实体语境说「启用 / 停用」。 */
export const ENTITY_STATUS_META: Record<CommonStatus, { label: string; tagColor: TagColor }> = {
  0: { label: '启用', tagColor: 'success' },
  1: { label: '停用', tagColor: 'default' },
};

/** 应用发布通道（fetchApplications 按 status 与 canary 字段派生）。 */
export type AppChannel = 'stable' | 'canary' | 'paused';

/**
 * 角色数据范围（Yudao RoleDataScopeEnum 1-5 的页内人话映射）。
 * 角色页列表列与编辑对话框共用，故住 domain 不住页内。
 */
export const ROLE_DATA_SCOPES: Array<{ value: number; label: string }> = [
  { value: 1, label: '全部数据' },
  { value: 2, label: '指定部门' },
  { value: 3, label: '本部门' },
  { value: 4, label: '本部门及以下' },
  { value: 5, label: '仅本人' },
];

/** dataScope 数值 → 标签；未知值兜底不裸奔数字。 */
export function roleDataScopeLabel(value: number): string {
  return ROLE_DATA_SCOPES.find((scope) => scope.value === value)?.label ?? `范围 ${value}`;
}

export const CHANNEL_META: Record<AppChannel, { label: string; tagColor: TagColor }> = {
  stable: { label: '正式版', tagColor: 'success' },
  canary: { label: '试运行', tagColor: 'warning' },
  paused: { label: '已停用', tagColor: 'default' },
};
