import { useEffect, useId, useMemo, useState } from 'react';
import { Button, Empty } from 'dingtalk-design-mobile';
import { CheckOutlined, ClockOutlined, InProcessOutlined, PulldownOutlined } from 'dd-icons';
import { PORTAL_ENV_LABEL, PORTAL_SOURCE_LABEL } from '../../store/portalNotice';
import {
  elapsedDays,
  groupRoadmapByStage,
  plannedDurationDays,
  useRoadmapStore,
} from '../../store/roadmap';
import type { PortalRoadmapItem, RoadmapStageGroup } from '../../store/roadmap';
import { PROGRESS_BOARD_QUERY, useMediaQuery } from '../../shell/useMediaQuery';

/**
 * 功能进展：讲清楚现在能体验什么、正在做什么、接下来会增加什么。
 *
 * 数据来自进展看板接口（批次 R 起，管理端「功能进展」页维护），不再是
 * 硬编码数组——管理端改了条目，用户进这页就能看到，不用等门户发版。
 *
 * ============================================================================
 * 为什么宽屏与窄屏是两套完全不同的 UI，而不是同一套挪位置
 * ============================================================================
 *
 * 这一页的数据形状是「一条路线 + 三个阶段」，宽屏与窄屏能承载的信息密度差三倍以上。
 * 只调模块位置（比如窄屏把两栏改成上下堆叠）的话，两个形态里总有一个是别扭的：
 *   - 宽屏上下堆叠会留下大片横向空白，一屏只能看到三项，且看不出阶段之间的推进关系；
 *   - 窄屏并排两栏会把每栏压到不到 180px，中文标题全折行，读起来是碎片的。
 *
 * 所以这里按形态给出**两种不同的信息结构**，共用同一份数据：
 *
 *   宽屏（≥1024px）——横向时间轴看板
 *     三列 = 三个阶段（已经可以体验 / 正在建设 / 规划中），每列是一根竖轨 + 若干节点卡。
 *     视线横着扫就能看出「已经落地了什么、下一步接什么」，这正是路线图该有的读法。
 *
 *   窄屏（<768px）——纵向折叠清单
 *     三个阶段收成三只手风琴，默认只展开第一阶段，其余显示「N 项」。
 *
 * 中等宽度（768~1023px，平板）用宽屏那套但两列。
 *
 * ============================================================================
 * 为什么这一页不编造运行数据
 * ============================================================================
 *
 * 没有真实数据支撑的数字（使用人数、可用率、响应时间）只会被误读成统计结论，
 * 所以只呈现功能层面的进展说明（进度与工期来自管理端维护的事实）。
 * 页面上的「不展示使用人数、响应速度等运行数据」是对用户的承诺，不是装饰文案。
 */

const STAGE_ICON = {
  check: <CheckOutlined />,
  process: <InProcessOutlined />,
  clock: <ClockOutlined />,
} as const;

/** 阶段状态标签（窄屏手风琴条目右侧） */
const STAGE_BADGE: Record<number, { className: string; text: string }> = {
  2: { className: 'ui-badge ui-badge--success', text: '可用' },
  1: { className: 'ui-badge ui-badge--info', text: '进行中' },
  0: { className: 'ui-badge', text: '未开始' },
};

/** 工期说明：进行中的条目按查看日现算（已进行 N 天 · 预计工期 M 天）。 */
function scheduleText(item: PortalRoadmapItem): string | undefined {
  if (item.stage === 2) return undefined;
  const days = elapsedDays(item);
  if (days === undefined) return undefined;
  const total = plannedDurationDays(item);
  return total !== undefined ? `已进行 ${days} 天 · 预计工期 ${total} 天` : `已进行 ${days} 天`;
}

/** 进度条 + 百分比 + 工期，宽窄屏两种形态共用（进度条本体对读屏隐藏，数字可达）。 */
function RoadmapBar({ item, tone }: { item: PortalRoadmapItem; tone: string }) {
  const schedule = scheduleText(item);
  return (
    <>
      <div className="roadmap-bar" aria-hidden="true">
        <span
          className={`roadmap-bar__fill roadmap-bar__fill--${tone}`}
          style={{ width: `${item.progress}%` }}
        />
      </div>
      <p className="roadmap-bar__label">
        <span className="ui-num">{item.progress}%</span>
        {schedule ? <span className="roadmap-bar__schedule">{schedule}</span> : null}
      </p>
    </>
  );
}

/**
 * 宽屏形态：横向时间轴看板。
 * 每个阶段一列，列内是竖轨 + 节点卡；节点卡左侧的圆点把视线串成一条线。
 */
function ProgressTimeline({ groups }: { groups: RoadmapStageGroup[] }) {
  return (
    <div className="progress-board" role="list" aria-label="功能进展阶段">
      {groups.map((group) => (
        <section className="progress-lane" key={group.stage} role="listitem" aria-label={group.title}>
          <header className="progress-lane__head">
            <span
              className={`ui-tile ui-tile--m ui-tone-${group.tone}`}
              aria-hidden="true"
            >
              {STAGE_ICON[group.icon]}
            </span>
            <div className="progress-lane__headtext">
              <h2 className="progress-lane__title">{group.title}</h2>
              <p className="progress-lane__summary">{group.summary}</p>
            </div>
            <span className="progress-lane__count ui-num">{group.items.length}</span>
          </header>

          {/* 竖轨：节点圆点挂在它上面，形成时间轴的连续感 */}
          <ol className="progress-track">
            {group.items.map((item) => (
              <li className="progress-node" key={item.id}>
                <span className="progress-node__dot" aria-hidden="true" />
                <div className="progress-node__card">
                  <p className="progress-node__name">{item.name}</p>
                  {item.description ? (
                    <p className="progress-node__desc">{item.description}</p>
                  ) : null}
                  <RoadmapBar item={item} tone={group.tone} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/**
 * 窄屏形态：纵向折叠清单。
 * 默认只展开第一阶段——首屏要能一眼看完「现在有什么」，其余按需展开。
 */
function ProgressAccordion({ groups }: { groups: RoadmapStageGroup[] }) {
  const [openStage, setOpenStage] = useState<number>(2);
  const baseId = useId();

  return (
    <div className="progress-accordion">
      {groups.map((group) => {
        const isOpen = openStage === group.stage;
        const panelId = `${baseId}-stage-${group.stage}`;

        return (
          <section className="progress-fold" key={group.stage}>
            <h2 className="progress-fold__heading">
              <button
                type="button"
                className={`progress-fold__trigger${isOpen ? ' is-open' : ''}`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenStage(group.stage)}
              >
                <span
                  className={`ui-tile ui-tile--m ui-tone-${group.tone}`}
                  aria-hidden="true"
                >
                  {STAGE_ICON[group.icon]}
                </span>
                <span className="progress-fold__text">
                  <span className="progress-fold__title">{group.title}</span>
                  <span className="progress-fold__summary">{group.summary}</span>
                </span>
                <span className="progress-fold__count">{group.items.length} 项</span>
                <span
                  className={`progress-fold__caret${isOpen ? ' is-open' : ''}`}
                  aria-hidden="true"
                >
                  <PulldownOutlined />
                </span>
              </button>
            </h2>

            <div className="progress-fold__panel" id={panelId} hidden={!isOpen}>
              <ul className="ui-items">
                {group.items.map((item) => (
                  <li className="ui-item" key={item.id}>
                    <span className="ui-item__text">
                      <span className="ui-item__title">{item.name}</span>
                      {item.description ? (
                        <span className="ui-item__desc">{item.description}</span>
                      ) : null}
                      <RoadmapBar item={item} tone={group.tone} />
                    </span>
                    <span className="ui-item__extra">
                      <span className={STAGE_BADGE[group.stage].className}>
                        {STAGE_BADGE[group.stage].text}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function StatusPage() {
  const isBoard = useMediaQuery(PROGRESS_BOARD_QUERY);
  const view = useRoadmapStore((state) => state.view);

  useEffect(() => {
    void useRoadmapStore.getState().fetch();
  }, []);

  const groups = useMemo(() => groupRoadmapByStage(view.data), [view.data]);

  return (
    <div className="ui-page portal-page--progress">
      <p className="portal-progress__lead">
        这里介绍门户现在可以体验的功能和接下来会新增的能力，不展示使用人数、响应速度等运行数据。
      </p>

      {/*
        按断点二选一渲染，而不是两套都放进 DOM 再用 CSS 藏一份。
        理由同顶栏导航：被 display:none 藏起的节点在 jsdom 与部分读屏软件里依然算数，
        会让「已经可以体验」这类小标题在同一页出现两份。
      */}
      {view.status === 'loading' ? (
        <div className="progress-skeleton" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <span className="ui-skeleton ui-skeleton--line" key={index} />
          ))}
        </div>
      ) : view.status === 'error' ? (
        <div className="ui-card ui-card--center">
          <div className="ui-errorstate" role="alert">
            <h3 className="ui-errorstate__title">无法加载功能进展</h3>
            <p className="ui-errorstate__desc">
              {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
            </p>
            <div className="ui-errorstate__actions">
              <Button size="large" onClick={() => void useRoadmapStore.getState().fetch()}>
                重试
              </Button>
            </div>
          </div>
        </div>
      ) : view.data.length === 0 ? (
        <div className="ui-card ui-card--center">
          <Empty title="还没有进展条目" inline />
          <p className="ui-note">管理端发布进展后，这里会自动更新。</p>
        </div>
      ) : isBoard ? (
        <ProgressTimeline groups={groups} />
      ) : (
        <ProgressAccordion groups={groups} />
      )}

      <p className="portal-progress__disclosure" role="note" aria-label="环境说明">
        {PORTAL_ENV_LABEL} · {PORTAL_SOURCE_LABEL}
        ：当前是界面功能体验，不包含真实业务数据，也不授予任何访问权限。
      </p>
    </div>
  );
}
