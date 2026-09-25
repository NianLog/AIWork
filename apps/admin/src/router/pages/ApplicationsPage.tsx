import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, SegmentedControl, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { CHANNEL_META, DEMO_APPLICATIONS_VIEW } from '../../store/demoDirectory';
import type { DemoApplicationRecord } from '../../store/demoDirectory';
import RowActions from '../parts/RowActions';

/**
 * 应用列表：后台的第一屏，回答「现在有哪些应用、各自处于什么状态」。
 *
 * 四态骨架（2026-09-25 批次二）：页面只认 DEMO_APPLICATIONS_VIEW 的
 * 「status + data + error」形状；演示数据永远 success，loading / error 由测试
 * 喂形状覆盖，P0-4 接真实接口时只换来源。
 *
 * 只展示业务用户看得懂的信息（名称、负责团队、版本、发布状态、最近更新时间），
 * 不渲染任何部署细节。所有写操作按钮永久禁用——没有后台服务就没有写路径，
 * 「能点但保存不了」比「不能点」更容易被误当成真实能力。
 *
 * 版式与交互（批次二/四）：
 * - 统计卡从「只能看」改成「能点」：点哪张卡就切到对应筛选（aria-pressed 表达选中），
 *   统计数字与表格之间从两张皮变成一条动线；总数卡切回全部；
 * - 最近更新列可排序，默认最新在前（「刚发布的排在最上面」是列表页的默认预期）；
 * - 分页 10 条一页且单页隐藏——现在四条数据不该出现分页器，接真实数据后自然出现；
 * - 操作列用 RowActions：文字主操作 + 「···」下拉收纳次要动作，不再摆三个图标按钮。
 *
 * 页头（h1）由外壳统一渲染：后台五个页面同构，标题写在 route handle 里，
 * 页面只负责标题下面的操作与内容。
 */

type ChannelFilter = 'all' | DemoApplicationRecord['channel'];

const CHANNEL_OPTIONS: Array<{ value: ChannelFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'stable', label: '正式版' },
  { value: 'canary', label: '试运行' },
  { value: 'paused', label: '已停用' },
];

/** 应用被下架时，无论原发布通道是什么，对外都只说「已停用」。 */
function resolveChannel(app: DemoApplicationRecord): DemoApplicationRecord['channel'] {
  return app.status === 1 ? app.channel : 'paused';
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');

  const view = DEMO_APPLICATIONS_VIEW;
  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return view.data.filter((app) => {
      if (channel !== 'all' && resolveChannel(app) !== channel) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [app.name, app.ownerTeam, app.version].some((field) => field.toLowerCase().includes(query));
    });
  }, [keyword, channel, view.data]);

  const stats = useMemo(() => {
    const countBy = (target: ChannelFilter) =>
      view.data.filter((app) => resolveChannel(app) === target).length;
    return [
      { label: '应用总数', value: view.data.length, tone: 'brand', filter: 'all' as ChannelFilter },
      /* 统计卡与筛选 tab、状态徽章共用一套口径：总数/正式版/试运行/已停用。
         旧卡的「已开放使用」是 正式版+试运行 的派生数（3），与筛选「正式版」（1）对不上。 */
      { label: '正式版', value: countBy('stable'), tone: 'success', filter: 'stable' as ChannelFilter },
      { label: '试运行中', value: countBy('canary'), tone: 'warning', filter: 'canary' as ChannelFilter },
      { label: '已停用', value: countBy('paused'), tone: 'neutral', filter: 'paused' as ChannelFilter },
    ];
  }, [view.data]);

  const columns: TableColumnsType<DemoApplicationRecord> = [
    {
      title: '应用',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <span>
          <span className="ui-cell-title">{record.name}</span>
          <span className="ui-cell-sub">由 {record.ownerTeam} 负责</span>
        </span>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (value: string) => <span className="ui-num">{value}</span>,
    },
    {
      title: '发布状态',
      key: 'channel',
      width: 116,
      render: (_, record) => {
        const meta = CHANNEL_META[resolveChannel(record)];
        return (
          <Tag color={meta.tagColor} size="small">
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '最近更新',
      dataIndex: 'publishedAt',
      key: 'publishedAt',
      width: 156,
      // 时间串 'YYYY-MM-DD HH:mm' 的字典序就是时间序；默认最新在前
      sorter: (a, b) => a.publishedAt.localeCompare(b.publishedAt),
      defaultSortOrder: 'descend',
      render: (value: string) => <span className="ui-num">{value}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 148,
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'edit',
              label: '编辑',
              disabled: true,
              ariaLabel: `编辑 ${record.name}（暂不可用）`,
            },
            {
              key: 'channel',
              label: '调整发布通道',
              disabled: true,
              reason: '后台服务尚未接入，暂不可用',
            },
            {
              key: 'unpublish',
              label: '下架应用',
              disabled: true,
              reason: '后台服务尚未接入，暂不可用',
            },
          ]}
        />
      ),
    },
  ];

  const activeIndex = CHANNEL_OPTIONS.findIndex((option) => option.value === channel);

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">这里列出所有已经上架到应用市场的应用，以及它们当前的版本和发布状态。</p>
        <div className="ui-pagehead__actions">
          {/* 这里刻意不放「刷新」：演示数据是同步常量，刷新没有任何可观察行为，
              一个点了没反应（或永久禁用）的按钮只会教用户「这产品有坏按钮」。
              接入真实数据后，刷新随 loading 态一起回来。 */}
          <Button type="primary" onClick={() => navigate('/preview/publish')}>
            发布新应用
          </Button>
        </div>
      </div>

      {/* 统计卡即筛选入口：点哪张卡切到对应口径（aria-pressed 表达选中），
          统计数字与表格从两张皮变成一条动线。span 而不是 p：button 里只允许短语内容。 */}
      <section className="ui-stats" aria-label="应用概览">
        {stats.map((item) => (
          <button
            type="button"
            className={`ui-stat ui-stat--${item.tone}${channel === item.filter ? ' is-active' : ''}`}
            key={item.label}
            aria-pressed={channel === item.filter}
            onClick={() => setChannel(item.filter)}
          >
            <span className="ui-stat__label">{item.label}</span>
            <span className="ui-stat__value ui-num">{item.value}</span>
          </button>
        ))}
      </section>

      <section className="ui-section" aria-label="应用明细">
        <Card className="ui-card ui-card--flush" title="全部应用">
          {view.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : view.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载应用列表</h3>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={() => window.location.reload()}>重试</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="ui-toolbar">
                <Input
                  className="ui-toolbar__search"
                  allowClear
                  placeholder="搜索应用名称、负责团队或版本"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <div className="ui-segments" role="group" aria-label="按发布状态筛选">
                  <SegmentedControl
                    texts={CHANNEL_OPTIONS.map((option) => option.label)}
                    activeIndex={activeIndex}
                    onChange={(index) => setChannel(CHANNEL_OPTIONS[index].value)}
                  />
                </div>
                <span className="ui-toolbar__count">共 {rows.length} 个应用</span>
              </div>
              <Table<DemoApplicationRecord>
                rowKey="appId"
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: '没有找到相关应用，试试换个关键词或切换发布状态。' }}
              />
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
