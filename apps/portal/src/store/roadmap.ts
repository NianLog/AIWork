/**
 * 功能进展路线：三个阶段（已经可以体验 / 正在建设 / 规划中）。
 *
 * 从 StatusPage 抽出来做共享数据源（2026-09-25 批次四）：工作台的
 * 「功能进展速览」与功能进展页读同一份数据，两处的阶段数与计数永远一致——
 * 各自维护一份必然漂移。
 *
 * 纪律：只记录能力层面的进展，不编造任何运行数据（使用人数、可用率、
 * 响应时间）——数字没有真实来源时只会被误读成统计结论，
 * 功能进展页的测试断言了这句承诺。
 */

export type StageKey = 'ready' | 'building' | 'planned';

export interface StageItem {
  name: string;
  desc: string;
}

export interface Stage {
  key: StageKey;
  title: string;
  /** 阶段的通俗说明，帮助判断这一阶段意味着什么 */
  summary: string;
  icon: 'check' | 'process' | 'clock';
  items: StageItem[];
}

export const ROADMAP_STAGES: Stage[] = [
  {
    key: 'ready',
    title: '已经可以体验',
    summary: '现在打开门户就能用，不需要登录',
    icon: 'check',
    items: [
      {
        name: '浏览应用与查看介绍',
        desc: '在工作台和应用市场查看每个应用能做什么、由哪个团队负责。',
      },
      {
        name: '查找与筛选应用',
        desc: '按名称、分类或团队搜索，也可在正式版、试运行、已停用之间切换查看。',
      },
    ],
  },
  {
    key: 'building',
    title: '正在建设',
    summary: '已经开工，还没有到可以试用的程度',
    icon: 'process',
    items: [
      {
        name: '统一登录',
        desc: '登录开通后，每个人看到的应用会跟随自己的岗位与所在组织。',
      },
      {
        name: '权限管理',
        desc: '每位成员能用哪些功能由管理员统一配置，互不越界。',
      },
    ],
  },
  {
    key: 'planned',
    title: '规划中',
    summary: '已经排进计划，尚未开工',
    icon: 'clock',
    items: [
      {
        name: '应用上架',
        desc: '业务团队可以自助提交新应用，审核通过后出现在应用市场。',
      },
      {
        name: '使用统计',
        desc: '按应用查看使用次数与活跃情况，帮助团队评估效果。',
      },
      {
        name: '消息提醒',
        desc: '任务完成、风险提醒等消息会通过工作台与钉钉送达。',
      },
      {
        name: '安全守护',
        desc: '所有操作留痕可查，异常使用及时提醒，保护数据安全。',
      },
    ],
  },
];

/** 工作台速览卡用的摘要：阶段 + 条目数。 */ 
export function summarizeRoadmap() {
  return ROADMAP_STAGES.map((stage) => ({
    key: stage.key,
    title: stage.title,
    summary: stage.summary,
    count: stage.items.length,
  }));
}
