import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, SegmentedControl, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { fetchApplications } from '../../api/yudao';
import type { ApplicationRow } from '../../api/yudao';
import { CHANNEL_META } from '../../store/domain';
import type { AppChannel } from '../../store/domain';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';

/**
 * 应用列表：后台的第一屏，回答「现在有哪些应用、各自处于什么状态」。
 *
 * 数据来源（批次 B 起）：真实接口 /admin-api/portal-app/page（字段映射与状态口径
 * 见 api/yudao.ts）。批次 H 起数据装载收敛到 useAdminData（四态 + reload +
 * 401 跳登录 + 竞态取消），本页不再自持 useEffect；未登录由路由守卫拦截。
 *
 * 只展示业务用户看得懂的信息（名称、版本、发布状态、最近更新时间），
 * 不渲染任何部署细节。写操作按钮保持禁用：编辑与调整通道的表单链路
 * 在批次 H Step 2 解禁（「能点但保存不了」比「不能点」更容易被误当成真实能力）。
 *
 * 版式与交互（批次二/四）：
 * - 统计卡可点：点哪张卡切到对应筛选（aria-pressed 表达选中），总数卡切回全部；
 * - 最近更新列可排序，默认最新在前；
 * - 分页 10 条一页且单页隐藏——数据少时不出分页器，数据多时自然出现；
 * - 操作列用 RowActions：文字主操作 + 「···」下拉收纳次要动作；
 * - 「刷新」随真实数据一起回归：重新拉取并走一遍 loading 态。
 *
 * 页头（h1）由外壳统一渲染：后台五个页面同构，标题写在 route handle 里，
 * 页面只负责标题下面的操作与内容。
 */

type ChannelFilter = 'all' | AppChannel;

const CHANNEL_OPTIONS: Array<{ value: ChannelFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'stable', label: '正式版' },
  { value: 'canary', label: '试运行' },
  { value: 'paused', label: '已停用' },
];

/** 应用被下架时，无论原发布通道是什么，对外都只说「已停用」（status 0=启用 1=停用，批次 C 已与后端同口径）。 */
function resolveChannel(app: ApplicationRow): AppChannel {
  return app.status === 0 ? app.channel : 'paused';
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const { view, reload } = useAdminData(fetchApplications);

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return view.data.filter((app) => {
      if (channel !== 'all' && resolveChannel(app) !== channel) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [app.name, app.appId, app.version].some((field) =>
        field.toLowerCase().includes(query),
      );
    });
  }, [keyword, channel, view.data]);

  const stats = useMemo(() => {
    const countBy = (target: ChannelFilter) =>
      view.data.filter((app) => resolveChannel(app) === target).length;
    return [
      { label: '应用总数', value: view.data.length, tone: 'brand', filter: 'all' as ChannelFilter },
      /* 统计卡与筛选 tab、状态徽章共用一套口径：总数/正式版/试运行/已停用。 */
      { label: '正式版', value: countBy('stable'), tone: 'success', filter: 'stable' as ChannelFilter },
      { label: '试运行中', value: countBy('canary'), tone: 'warning', filter: 'canary' as ChannelFilter },
      { label: '已停用', value: countBy('paused'), tone: 'neutral', filter: 'paused' as ChannelFilter },
    ];
  }, [view.data]);

  const columns: TableColumnsType<ApplicationRow> = [
    {
      title: '应用',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <span>
          <span className="ui-cell-title">{record.name}</span>
          <span className="ui-cell-sub">应用标识 {record.appId}</span>
        </span>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (value: string) => <span className="ui-num">{value || '—'}</span>,
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
          {/* 真实数据回来了，「刷新」随之回归：重新拉取并走一遍 loading 态 */}
          <Button onClick={reload}>刷新</Button>
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
                <Button onClick={reload}>重试</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="ui-toolbar">
                <Input
                  className="ui-toolbar__search"
                  allowClear
                  placeholder="搜索应用名称、标识或版本"
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
              <Table<ApplicationRow>
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
