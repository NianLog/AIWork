import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Radio,
  SegmentedControl,
  Table,
  Tag,
  message,
} from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { fetchApplications, fetchAppVersions, updateApplication } from '../../api/yudao';
import type { ApplicationRow, AppVersionRow } from '../../api/yudao';
import { CHANNEL_META } from '../../store/domain';
import type { AppChannel, CommonStatus } from '../../store/domain';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';

/**
 * 应用列表：后台的第一屏，回答「现在有哪些应用、各自处于什么状态」。
 *
 * 数据（批次 B 起 /admin-api/portal-app/page）经 useAdminData 装载（批次 H 收敛：
 * 四态 + reload + 401 跳登录 + 竞态取消）；未登录由路由守卫拦截。
 *
 * 批次 H Step 2 写操作解禁：
 * - 编辑 → 携整行记录跳发布页（location.state.app，同表单走 update）；
 * - 调整发布通道 → 确认对话框里选方式，正式版会把试运行字段清零；
 * - 下架 / 重新上架 → 确认对话框翻转 status；
 * 全部走 updateApplication 整行展开再覆盖（Yudao PUT 全量语义，防字段清空），
 * 成功后 message 反馈并 reload，失败把接口的人话错误透出来。
 *
 * 版式与交互（批次二/四）：统计卡可点切筛选；最近更新列可排序默认最新在前；
 * 分页 10 条单页隐藏；操作列 RowActions 文字主操作 + 「···」收纳次要动作。
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

/** 下架 / 重新上架共用的确认对话框状态。 */
interface PendingStatus {
  row: ApplicationRow;
  next: CommonStatus;
}

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const { view, reload } = useAdminData(fetchApplications);

  const [busy, setBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<PendingStatus | null>(null);
  const [channelTarget, setChannelTarget] = useState<ApplicationRow | null>(null);
  const [channelMode, setChannelMode] = useState<'stable' | 'canary'>('stable');
  const [canaryVersion, setCanaryVersion] = useState('');
  const [canaryRatio, setCanaryRatio] = useState(10);

  /** 版本与回滚弹窗（批次 I）：目标行 + 磁盘版本目录 + 回滚二次确认。 */
  const [versionsTarget, setVersionsTarget] = useState<ApplicationRow | null>(null);
  const [versions, setVersions] = useState<AppVersionRow[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<AppVersionRow | null>(null);

  /** 写操作统一动线：busy 锁按钮 → 成功 message+reload → 失败透出人话错误。 */
  async function runWrite(successText: string, action: () => Promise<void>): Promise<void> {
    setBusy(true);
    try {
      await action();
      message.success(successText);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  function openChannelDialog(row: ApplicationRow) {
    setChannelTarget(row);
    setChannelMode(row.channel === 'canary' ? 'canary' : 'stable');
    setCanaryVersion(row.canaryVersion ?? '');
    // `|| 10` 而非 `?? 10`：ApplicationRow 把无试运行配置归一成 0（null 不会出现），
    // 正式版应用首次切试运行要给 10% 起步值，否则预填 0% 违反 InputNumber min=1
    setCanaryRatio(row.canaryRatio || 10);
  }

  async function confirmChannel() {
    if (!channelTarget) return;
    if (channelMode === 'canary' && !canaryVersion.trim()) {
      message.warning('试运行需要填写版本号。');
      return;
    }
    await runWrite('发布通道已调整。', async () => {
      await updateApplication(
        channelTarget,
        channelMode === 'canary'
          ? { canaryVersion: canaryVersion.trim(), canaryRatio }
          : { canaryVersion: '', canaryRatio: 0 },
      );
      setChannelTarget(null);
    });
  }

  async function confirmStatus() {
    if (!pendingStatus) return;
    const { row, next } = pendingStatus;
    await runWrite(next === 1 ? '应用已下架。' : '应用已重新上架。', async () => {
      await updateApplication(row, { status: next });
      setPendingStatus(null);
    });
  }

  async function openVersions(row: ApplicationRow) {
    setVersionsTarget(row);
    setVersions([]);
    setVersionsLoading(true);
    try {
      setVersions(await fetchAppVersions(row.appId));
    } catch (error) {
      message.error(error instanceof Error ? error.message : '版本列表加载失败。');
      setVersionsTarget(null);
    } finally {
      setVersionsLoading(false);
    }
  }

  /** 稳定版回滚=指针拨回（版本目录不可变）；canary 撤退走「调整发布通道」清字段。 */
  async function confirmRollback() {
    if (!versionsTarget || !rollbackTarget) return;
    await runWrite(`已回滚到 ${rollbackTarget.version}。`, async () => {
      await updateApplication(versionsTarget, {
        version: rollbackTarget.version,
        latestVersion: rollbackTarget.version,
      });
      setRollbackTarget(null);
      setVersions(await fetchAppVersions(versionsTarget.appId));
    });
  }

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
              ariaLabel: `编辑 ${record.name}`,
              onClick: () => navigate('/preview/publish', { state: { app: record } }),
            },
            {
              key: 'channel',
              label: '调整发布通道',
              onClick: () => openChannelDialog(record),
            },
            {
              key: 'versions',
              label: '版本与回滚',
              onClick: () => openVersions(record),
            },
            {
              key: record.status === 0 ? 'unpublish' : 'republish',
              label: record.status === 0 ? '下架应用' : '重新上架',
              onClick: () => setPendingStatus({ row: record, next: record.status === 0 ? 1 : 0 }),
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

      {/* 下架 / 重新上架确认：翻转 status 走整行 update，配置全保留 */}
      <Modal
        open={pendingStatus !== null}
        title={pendingStatus?.next === 1 ? '下架应用' : '重新上架'}
        okText={pendingStatus?.next === 1 ? '确认下架' : '确认上架'}
        cancelText="取消"
        confirmLoading={busy}
        onOk={confirmStatus}
        onCancel={() => setPendingStatus(null)}
      >
        <p>
          {pendingStatus?.next === 1
            ? `下架后「${pendingStatus?.row.name}」立即从应用市场消失，正在使用的成员会看到已停用提示；配置保留，可随时重新上架。`
            : `「${pendingStatus?.row.name}」将重新出现在应用市场，成员可以再次进入使用。`}
        </p>
      </Modal>

      {/* 调整发布通道：正式发布会把试运行版本与比例清零 */}
      <Modal
        open={channelTarget !== null}
        title="调整发布通道"
        okText="确认调整"
        cancelText="取消"
        confirmLoading={busy}
        onOk={confirmChannel}
        onCancel={() => setChannelTarget(null)}
      >
        <p>
          「{channelTarget?.name}」当前的发布方式调整后立即生效，成员下次进入应用时按新通道获取版本。
        </p>
        <Radio.Group
          value={channelMode}
          onChange={(event) => setChannelMode(event.target.value)}
        >
          <Radio value="stable">正式发布（全部成员使用当前版本）</Radio>
          <Radio value="canary">试运行（一部分成员先试用新版本）</Radio>
        </Radio.Group>
        {channelMode === 'canary' ? (
          <div className="ui-form-grid" style={{ marginTop: 12 }}>
            <label className="ui-field">
              <span className="ui-field__label">试运行版本</span>
              <Input
                value={canaryVersion}
                onChange={(event) => setCanaryVersion(event.target.value)}
                placeholder="例如：1.5.0-rc.1"
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">试运行比例</span>
              <InputNumber
                value={canaryRatio}
                min={1}
                max={100}
                addonAfter="%"
                onChange={(value) => setCanaryRatio(value ?? 10)}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      {/* 版本与回滚（批次 I）：磁盘版本目录 + 指针徽标；旧目录不可变，回滚即改指针 */}
      <Modal
        open={versionsTarget !== null}
        title={`版本与回滚 · ${versionsTarget?.name ?? ''}`}
        footer={null}
        onCancel={() => setVersionsTarget(null)}
      >
        <p className="ui-cell-sub" style={{ marginBottom: 8 }}>
          版本目录不可变：回滚只是把展示指针拨回旧版，旧版本文件原样保留，随时可再切回。
        </p>
        <Table<AppVersionRow>
          rowKey="version"
          size="small"
          loading={versionsLoading}
          dataSource={versions}
          pagination={false}
          columns={[
            {
              title: '版本',
              dataIndex: 'version',
              key: 'version',
              render: (value: string) => <span className="ui-num">{value}</span>,
            },
            {
              title: '发布时间',
              dataIndex: 'buildTime',
              key: 'buildTime',
              render: (value: string | null) => <span className="ui-num">{value ?? '—'}</span>,
            },
            {
              title: '发布人',
              dataIndex: 'uploader',
              key: 'uploader',
              render: (value: string | null) => value ?? '—',
            },
            {
              title: '指针',
              key: 'flags',
              render: (_, record) => (
                <>
                  {record.isDisplay ? <Tag color="blue" size="small">当前展示</Tag> : null}
                  {record.isCanary ? <Tag color="orange" size="small">试运行</Tag> : null}
                  {record.isLatest ? <Tag size="small">稳定最新</Tag> : null}
                </>
              ),
            },
            {
              title: '操作',
              key: 'actions',
              width: 116,
              render: (_, record) => (
                <Button size="small" disabled={record.isDisplay} onClick={() => setRollbackTarget(record)}>
                  回滚到此版
                </Button>
              ),
            },
          ]}
        />
      </Modal>

      {/* 回滚二次确认 */}
      <Modal
        open={rollbackTarget !== null}
        title="回滚确认"
        okText={`回滚到 ${rollbackTarget?.version ?? ''}`}
        cancelText="取消"
        confirmLoading={busy}
        onOk={confirmRollback}
        onCancel={() => setRollbackTarget(null)}
      >
        <p>
          「{versionsTarget?.name}」将回滚到 {rollbackTarget?.version}，成员下次进入应用即回到该版本；
          当前版本文件不会被删除，随时可再切回。
        </p>
      </Modal>
    </div>
  );
}
