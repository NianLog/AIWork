import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, SegmentedControl, Space, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { DeleteOutlined, RefreshOutlined, SettingOutlined, WriteEditOutlined } from 'dd-icons';
import { CHANNEL_META, DEMO_APPLICATIONS } from '../../store/demoDirectory';
import type { DemoApplicationRecord } from '../../store/demoDirectory';

/**
 * 应用列表：后台的第一屏，回答「现在有哪些应用、各自处于什么状态」。
 *
 * 只展示业务用户看得懂的信息（名称、负责团队、版本、发布状态、最近更新时间），
 * 不渲染任何部署细节。所有写操作按钮永久禁用——没有后台服务就没有写路径，
 * 「能点但保存不了」比「不能点」更容易被误当成真实能力。
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

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return DEMO_APPLICATIONS.filter((app) => {
      if (channel !== 'all' && resolveChannel(app) !== channel) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [app.name, app.ownerTeam, app.version].some((field) => field.toLowerCase().includes(query));
    });
  }, [keyword, channel]);

  const stats = useMemo(() => {
    const countBy = (target: ChannelFilter) =>
      DEMO_APPLICATIONS.filter((app) => resolveChannel(app) === target).length;
    return [
      { label: '应用总数', value: DEMO_APPLICATIONS.length },
      { label: '已开放使用', value: DEMO_APPLICATIONS.filter((app) => app.status === 1).length },
      { label: '试运行中', value: countBy('canary') },
      { label: '已停用', value: countBy('paused') },
    ];
  }, []);

  const columns: TableColumnsType<DemoApplicationRecord> = [
    {
      title: '应用',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <span>
          <span className="admin-cell-title">{record.name}</span>
          <span className="admin-cell-sub">由 {record.ownerTeam} 负责</span>
        </span>
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 100,
      render: (value: string) => <span className="admin-num">{value}</span>,
    },
    {
      title: '发布状态',
      key: 'channel',
      width: 120,
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
      width: 160,
      render: (value: string) => <span className="admin-num">{value}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 132,
      render: (_, record) => (
        <Space size={4}>
          <Button
            size="small"
            type="text"
            icon={<WriteEditOutlined />}
            disabled
            aria-label={`编辑 ${record.name}（暂不可用）`}
          />
          <Button
            size="small"
            type="text"
            icon={<SettingOutlined />}
            disabled
            aria-label={`设置 ${record.name}（暂不可用）`}
          />
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            disabled
            aria-label={`下架 ${record.name}（暂不可用）`}
          />
        </Space>
      ),
    },
  ];

  const activeIndex = CHANNEL_OPTIONS.findIndex((option) => option.value === channel);

  return (
    <>
      <div className="admin-pagehead">
        <div className="admin-pagehead__row">
          <div>
            <h1 className="admin-pagehead__title">应用列表</h1>
            <p className="admin-pagehead__lead">
              这里列出所有已经上架到应用市场的应用，以及它们当前的版本和发布状态。
            </p>
          </div>
          <div className="admin-pagehead__actions">
            <Button icon={<RefreshOutlined />} disabled>
              刷新列表（暂不可用）
            </Button>
            <Button type="primary" onClick={() => navigate('/preview/publish')}>
              发布新应用
            </Button>
          </div>
        </div>
      </div>

      <section className="admin-stats" aria-label="应用概览">
        {stats.map((item) => (
          <Card key={item.label} size="small" className="admin-stat">
            <p className="admin-stat__label">{item.label}</p>
            <p className="admin-stat__value admin-num">{item.value}</p>
          </Card>
        ))}
      </section>

      <section className="admin-section" aria-label="应用明细">
        <Card title="全部应用" bodyStyle={{ padding: 0 }}>
          <div className="admin-toolbar">
            <Input
              className="admin-toolbar__search"
              allowClear
              placeholder="搜索应用名称、负责团队或版本"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <div role="group" aria-label="按发布状态筛选">
              <SegmentedControl
                texts={CHANNEL_OPTIONS.map((option) => option.label)}
                activeIndex={activeIndex}
                onChange={(index) => setChannel(CHANNEL_OPTIONS[index].value)}
              />
            </div>
            <span className="admin-toolbar__count">共 {rows.length} 个应用</span>
          </div>
          <Table<DemoApplicationRecord>
            rowKey="appId"
            columns={columns}
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: '没有找到相关应用，试试换个关键词或切换发布状态。' }}
          />
        </Card>
      </section>
    </>
  );
}
