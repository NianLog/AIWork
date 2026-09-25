import { useId, useState } from 'react';
import { CheckOutlined, ClockOutlined, InProcessOutlined, PulldownOutlined } from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from '../../store/demoCatalog';
import { ROADMAP_STAGES as STAGES } from '../../store/roadmap';
import type { StageKey } from '../../store/roadmap';
import { PROGRESS_BOARD_QUERY, useMediaQuery } from '../../shell/useMediaQuery';

/**
 * 功能进展：讲清楚现在能体验什么、接下来会增加什么。
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
 *     每列顶部有阶段说明与计数，列与列之间是并列关系而不是先后关系。
 *
 *   窄屏（<768px）——纵向折叠清单
 *     三个阶段收成三只手风琴，默认只展开第一阶段，其余显示「N 项」。
 *     一次只处理一组信息，需要时再展开；一屏不会堆满十几条，滚动深度从三屏降到一屏。
 *
 * 中等宽度（768~1023px，平板）用宽屏那套但两列：三根轨道在 900px 下每根不到 280px，
 * 卡片标题会折行。两列 + 第三列换行，比三列硬挤好看。
 *
 * ============================================================================
 * 为什么这一页不编造运行数据
 * ============================================================================
 *
 * 没有真实数据支撑的数字（使用人数、可用率、响应时间）只会被误读成统计结论，
 * 所以只呈现功能层面的进展说明。测试会断言页面上有「不展示使用人数、响应速度等运行数据」
 * 这句话——这是对用户的承诺，不是装饰文案。
 */

const STAGE_ICON = {
  check: <CheckOutlined />,
  process: <InProcessOutlined />,
  clock: <ClockOutlined />,
} as const;

/** 阶段与图标的语义色：与 tokens.css 的 --ui-tone-* 一一对应 */
const STAGE_TONE: Record<StageKey, string> = {
  ready: 'ui-tone-emerald',
  building: 'ui-tone-cyan',
  planned: 'ui-tone-slate',
};

/** 阶段状态标签 */
const STAGE_BADGE: Record<StageKey, { className: string; text: string }> = {
  ready: { className: 'ui-badge ui-badge--success', text: '可用' },
  building: { className: 'ui-badge ui-badge--info', text: '进行中' },
  planned: { className: 'ui-badge', text: '未开始' },
};

/**
 * 宽屏形态：横向时间轴看板。
 * 每个阶段一列，列内是竖轨 + 节点卡；节点卡左侧的圆点把视线串成一条线。
 */
function ProgressTimeline() {
  return (
    <div className="progress-board" role="list" aria-label="功能进展阶段">
      {STAGES.map((stage) => (
        <section className="progress-lane" key={stage.key} role="listitem" aria-label={stage.title}>
          <header className="progress-lane__head">
            <span
              className={`ui-tile ui-tile--m ${STAGE_TONE[stage.key]}`}
              aria-hidden="true"
            >
              {STAGE_ICON[stage.icon]}
            </span>
            <div className="progress-lane__headtext">
              <h2 className="progress-lane__title">{stage.title}</h2>
              <p className="progress-lane__summary">{stage.summary}</p>
            </div>
            <span className="progress-lane__count ui-num">{stage.items.length}</span>
          </header>

          {/* 竖轨：节点圆点挂在它上面，形成时间轴的连续感 */}
          <ol className="progress-track">
            {stage.items.map((item) => (
              <li className="progress-node" key={item.name}>
                <span className="progress-node__dot" aria-hidden="true" />
                <div className="progress-node__card">
                  <p className="progress-node__name">{item.name}</p>
                  <p className="progress-node__desc">{item.desc}</p>
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
function ProgressAccordion() {
  const [openKey, setOpenKey] = useState<StageKey>('ready');
  const baseId = useId();

  return (
    <div className="progress-accordion">
      {STAGES.map((stage) => {
        const isOpen = openKey === stage.key;
        const panelId = `${baseId}-${stage.key}`;

        return (
          <section className="progress-fold" key={stage.key}>
            <h2 className="progress-fold__heading">
              <button
                type="button"
                className={`progress-fold__trigger${isOpen ? ' is-open' : ''}`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenKey(stage.key)}
              >
                <span
                  className={`ui-tile ui-tile--m ${STAGE_TONE[stage.key]}`}
                  aria-hidden="true"
                >
                  {STAGE_ICON[stage.icon]}
                </span>
                <span className="progress-fold__text">
                  <span className="progress-fold__title">{stage.title}</span>
                  <span className="progress-fold__summary">{stage.summary}</span>
                </span>
                <span className="progress-fold__count">{stage.items.length} 项</span>
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
                {stage.items.map((item) => (
                  <li className="ui-item" key={item.name}>
                    <span className="ui-item__text">
                      <span className="ui-item__title">{item.name}</span>
                      <span className="ui-item__desc">{item.desc}</span>
                    </span>
                    <span className="ui-item__extra">
                      <span className={STAGE_BADGE[stage.key].className}>
                        {STAGE_BADGE[stage.key].text}
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
      {isBoard ? <ProgressTimeline /> : <ProgressAccordion />}

      <p className="portal-progress__disclosure" role="note" aria-label="体验说明">
        {DEMO_DISCLOSURE} · {DEMO_SESSION_LABEL}
        ：当前是界面功能体验，不包含真实业务数据，也不授予任何访问权限。
      </p>
    </div>
  );
}