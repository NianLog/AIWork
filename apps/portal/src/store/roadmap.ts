import { create } from 'zustand';
import { ApiError, fetchRoadmapItems } from '../api/yudao';
import type { PortalRoadmapItem, RoadmapStageValue } from '../api/yudao';
import { useSessionStore } from './sessionStore';

export type { PortalRoadmapItem, RoadmapStageValue } from '../api/yudao';

/**
 * 功能进展 store（批次 R）：进展条目的唯一数据源，替代硬编码 TS 数组——
 * 管理端「功能进展」页编辑后，门户进展页与工作台速览显示的就是同一份。
 *
 * - 每次挂载页面都重新拉取（in-flight 去重），语义与应用注册表 store 一致：
 *   管理端改了条目，用户进页面就能看到，不用等门户发版；
 * - 401（会话过期）交给路由守卫，与 appRegistryStore 同策略。
 *
 * 纪律继承自静态版：只记录能力层面的进展，不编造任何运行数据（使用人数、
 * 可用率、响应时间）——数字没有真实来源时只会被误读成统计结论。
 */

/** 四态数据视图契约：与应用注册表共用同一个形状（各 store 独立持有状态）。 */
export interface DataView<T> {
  status: 'loading' | 'error' | 'success';
  data: T[];
  error?: string;
}

interface RoadmapState {
  view: DataView<PortalRoadmapItem>;
  fetch(): Promise<void>;
  flight: Promise<void> | undefined;
}

export const useRoadmapStore = create<RoadmapState>((set, get) => ({
  view: { status: 'loading', data: [] },
  flight: undefined,
  async fetch() {
    const existing = get().flight;
    if (existing) return existing;
    const flight = (async () => {
      set({ view: { status: 'loading', data: [] } });
      try {
        const data = await fetchRoadmapItems();
        set({ view: { status: 'success', data } });
      } catch (error) {
        if (error instanceof ApiError && error.code === 401) {
          useSessionStore.getState().dropSession();
          set({ view: { status: 'error', data: [], error: '登录状态已过期，请重新登录。' } });
          return;
        }
        set({
          view: {
            status: 'error',
            data: [],
            error: error instanceof Error ? error.message : '进展条目暂时没有取到，稍后重试一般就能恢复。',
          },
        });
      } finally {
        set({ flight: undefined });
      }
    })();
    set({ flight });
    return flight;
  },
}));

/* ------------------------------------------------------------------ */
/* 展示层派生：阶段标题/图标/说明是展示层常量（不入库），条目本身来自接口。 */
/* ------------------------------------------------------------------ */

/** 阶段展示定义：按「已完成 → 进行中 → 规划中」排列（路线图的读法）。 */
export const ROADMAP_STAGE_DEFS: Array<{
  stage: RoadmapStageValue;
  title: string;
  summary: string;
  icon: 'check' | 'process' | 'clock';
  tone: 'emerald' | 'cyan' | 'slate';
}> = [
  {
    stage: 2,
    title: '已经可以体验',
    summary: '现在打开门户就能用',
    icon: 'check',
    tone: 'emerald',
  },
  {
    stage: 1,
    title: '正在建设',
    summary: '已经开工，还没有到可以试用的程度',
    icon: 'process',
    tone: 'cyan',
  },
  {
    stage: 0,
    title: '规划中',
    summary: '已经排进计划，尚未开工',
    icon: 'clock',
    tone: 'slate',
  },
];

export interface RoadmapStageGroup {
  stage: RoadmapStageValue;
  title: string;
  summary: string;
  icon: 'check' | 'process' | 'clock';
  tone: 'emerald' | 'cyan' | 'slate';
  items: PortalRoadmapItem[];
}

/** 按阶段分组（阶段定义顺序恒定，组内保持接口排序：阶段内 sort 小者在前）。 */
export function groupRoadmapByStage(items: PortalRoadmapItem[]): RoadmapStageGroup[] {
  return ROADMAP_STAGE_DEFS.map((def) => ({
    ...def,
    items: items.filter((item) => item.stage === def.stage),
  }));
}

/** 工作台速览卡用的摘要：阶段 + 条目数。 */
export function summarizeRoadmap(items: PortalRoadmapItem[]) {
  return groupRoadmapByStage(items).map((group) => ({
    key: group.stage,
    title: group.title,
    summary: group.summary,
    count: group.items.length,
  }));
}

const DAY_MS = 86_400_000;

function parseDay(value: string): number {
  // 本地零点解析（带 T00:00:00，避免裸日期被当 UTC 造成时区偏移）
  return new Date(`${value}T00:00:00`).getTime();
}

/**
 * 已进行天数：查看日 − 开始日期；未开工（日期在未来）或没填开始日期则不算。
 * 工期按查看日现算——库里只存事实，不存随时会过期的差值。
 */
export function elapsedDays(item: PortalRoadmapItem, now = Date.now()): number | undefined {
  if (!item.startDate) return undefined;
  const diff = Math.floor((now - parseDay(item.startDate)) / DAY_MS);
  return diff >= 0 ? diff : undefined;
}

/** 预计总工期天数：预计完成 − 开始；两个日期都填了才算得出。 */
export function plannedDurationDays(item: PortalRoadmapItem): number | undefined {
  if (!item.startDate || !item.dueDate) return undefined;
  const diff = Math.round((parseDay(item.dueDate) - parseDay(item.startDate)) / DAY_MS);
  return diff > 0 ? diff : undefined;
}
