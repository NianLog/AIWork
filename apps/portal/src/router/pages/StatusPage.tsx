import { List, NoticeBar, Tag } from 'dingtalk-design-mobile';
import { CheckOutlined, ClockOutlined } from 'dd-icons';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from '../../store/demoCatalog';

/**
 * 功能进展：讲清楚现在能体验什么、接下来会增加什么。
 *
 * 这一页刻意不编造使用人数、可用率、响应时间等运行指标——没有真实数据支撑的数字
 * 只会被误读成统计结论，因此只呈现功能层面的进展说明。
 */

const READY_ITEMS = [
  {
    name: '浏览应用与查看介绍',
    desc: '在工作台和应用市场查看每个应用能做什么、由哪个团队负责。',
  },
  {
    name: '查找与筛选应用',
    desc: '按名称、分类或团队搜索，也可在正式版、试运行、已停用之间切换查看。',
  },
];

const PLANNED_ITEMS = [
  {
    name: '统一登录',
    state: '建设中',
    desc: '登录开通后，每个人看到的应用会跟随自己的岗位与所在组织。',
  },
  {
    name: '权限管理',
    state: '建设中',
    desc: '每位成员能用哪些功能由管理员统一配置，互不越界。',
  },
  {
    name: '应用上架',
    state: '规划中',
    desc: '业务团队可以自助提交新应用，审核通过后出现在应用市场。',
  },
  {
    name: '使用统计',
    state: '规划中',
    desc: '按应用查看使用次数与活跃情况，帮助团队评估效果。',
  },
  {
    name: '消息提醒',
    state: '规划中',
    desc: '任务完成、风险提醒等消息会通过工作台与钉钉送达。',
  },
  {
    name: '安全守护',
    state: '规划中',
    desc: '所有操作留痕可查，异常使用及时提醒，保护数据安全。',
  },
];

export default function StatusPage() {
  return (
    <>
      <section className="portal-section" aria-label="进展说明">
        <div className="portal-card">
          <p className="portal-progress__lead">
            这里介绍门户现在可以体验的功能和接下来会新增的能力，不展示使用人数、响应速度等运行数据。
          </p>
        </div>
      </section>

      <section className="portal-section" aria-label="已经可以体验">
        <div className="portal-section__head">
          <h2 className="portal-section__title">已经可以体验</h2>
        </div>
        <List>
          {READY_ITEMS.map((item) => (
            <List.Item
              key={item.name}
              thumb={
                <span className="portal-appicon portal-appicon--sm portal-appicon--emerald" aria-hidden="true">
                  <CheckOutlined />
                </span>
              }
              extra={
                <Tag size="small" color="success" fill="outline">
                  已上线
                </Tag>
              }
              brief={item.desc}
            >
              {item.name}
            </List.Item>
          ))}
        </List>
      </section>

      <section className="portal-section" aria-label="正在建设">
        <div className="portal-section__head">
          <h2 className="portal-section__title">正在建设</h2>
        </div>
        <List>
          {PLANNED_ITEMS.map((item) => (
            <List.Item
              key={item.name}
              thumb={
                <span className="portal-appicon portal-appicon--sm portal-appicon--slate" aria-hidden="true">
                  <ClockOutlined />
                </span>
              }
              extra={
                <Tag size="small" color="default" fill="outline">
                  {item.state}
                </Tag>
              }
              brief={item.desc}
            >
              {item.name}
            </List.Item>
          ))}
        </List>
      </section>

      <section className="portal-section" aria-label="体验说明">
        <div className="portal-card">
          <div role="note" aria-label="体验说明">
            <NoticeBar text={`${DEMO_DISCLOSURE} · ${DEMO_SESSION_LABEL}`} />
            <p className="portal-note-text">
              当前是界面功能体验：无需登录，不包含真实业务数据，也不授予任何访问权限。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}