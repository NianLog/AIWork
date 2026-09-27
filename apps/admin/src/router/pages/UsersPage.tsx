import { useMemo, useState } from 'react';
import { Button, Card, Input, Modal, SegmentedControl, Table, Tag, message } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import { fetchUsers, formatDateTime, updateUserStatus } from '../../api/yudao';
import type { UserRow } from '../../api/yudao';
import { USER_STATUS_META } from '../../store/domain';
import type { CommonStatus } from '../../store/domain';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';
import UserEditDialog from '../parts/UserEditDialog';
import RoleAssignDialog from '../parts/RoleAssignDialog';

/**
 * 用户列表（批次 H Step 3 真实化）：真实接口 /system/user/page 经 useAdminData 装载。
 *
 * 状态砍三态留两态（CommonStatus 0/1）：「待激活」演示语义删除，
 * 从未登录在「最近登录」列显示「—」（0 排最旧，不再是独立档位）。
 *
 * 角色列改为部门 + 手机号：列表接口不带回角色，逐行查角色是 N+1，
 * 角色信息只在「调整角色」对话框里出现（决策见批次 H 计划）。
 *
 * 写操作解禁：新增/编辑（UserEditDialog）、调整角色（RoleAssignDialog）、
 * 停用/启用（确认后走独立 update-status 端点，2026-09-27 实测 body {id, status}）。
 * 「同步通讯录」删除：免登凭证未批，同步无落点（批次 H 决策）。
 *
 * 版式沿用批次二/四：统计卡可点切筛选；最近登录可排序默认最新在前；
 * 分页 10 条单页隐藏；操作列 RowActions 文字主操作 + ··· 下拉。
 */

type StatusFilter = 'all' | CommonStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 0, label: USER_STATUS_META[0].label },
  { value: 1, label: USER_STATUS_META[1].label },
];

/** 停用 / 重新启用共用的确认对话框状态。 */
interface PendingStatus {
  user: UserRow;
  next: CommonStatus;
}

export default function UsersPage() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const { view, reload } = useAdminData(fetchUsers);

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<UserRow | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PendingStatus | null>(null);

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

  async function confirmStatus() {
    if (!pendingStatus) return;
    const { user, next } = pendingStatus;
    await runWrite(next === 1 ? '成员已停用。' : '成员已启用。', async () => {
      await updateUserStatus(user.id, next);
      setPendingStatus(null);
    });
  }

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return view.data.filter((user) => {
      if (status !== 'all' && user.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [user.nickname, user.username, user.deptName, user.mobile].some((field) =>
        field.toLowerCase().includes(query),
      );
    });
  }, [keyword, status, view.data]);

  const stats = useMemo(() => {
    const countBy = (target: CommonStatus) =>
      view.data.filter((user) => user.status === target).length;
    return [
      { label: '成员总数', value: view.data.length, tone: 'brand', filter: 'all' as StatusFilter },
      { label: USER_STATUS_META[0].label, value: countBy(0), tone: 'success', filter: 0 as StatusFilter },
      { label: USER_STATUS_META[1].label, value: countBy(1), tone: 'neutral', filter: 1 as StatusFilter },
    ];
  }, [view.data]);

  const columns: TableColumnsType<UserRow> = [
    {
      title: '成员',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (_, record) => (
        <span>
          <span className="ui-cell-title">{record.nickname || record.username}</span>
          <span className="ui-cell-sub">账号 {record.username}</span>
        </span>
      ),
    },
    {
      title: '部门',
      dataIndex: 'deptName',
      key: 'deptName',
      width: 156,
      render: (value: string) => <span>{value || '—'}</span>,
    },
    {
      title: '手机号',
      dataIndex: 'mobile',
      key: 'mobile',
      width: 140,
      render: (value: string) => <span className="ui-num">{value || '—'}</span>,
    },
    {
      title: '最近登录',
      dataIndex: 'loginDate',
      key: 'loginDate',
      width: 156,
      // epoch 毫秒数值排序；从未登录（0）排最旧；空显示「—」
      sorter: (a, b) => a.loginDate - b.loginDate,
      defaultSortOrder: 'descend',
      render: (value: number) => (
        <span className={value === 0 ? 'admin-cell-muted' : 'ui-num'}>
          {value === 0 ? '—' : formatDateTime(value)}
        </span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 108,
      render: (_, record) => {
        const meta = USER_STATUS_META[record.status];
        return (
          <Tag color={meta.tagColor} size="small">
            {meta.label}
          </Tag>
        );
      },
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
              ariaLabel: `编辑 ${record.nickname || record.username}`,
              onClick: () => setEditing(record),
            },
            {
              key: 'roles',
              label: '调整角色',
              onClick: () => setAssigning(record),
            },
            {
              key: record.status === 0 ? 'disable' : 'enable',
              label: record.status === 0 ? '停用成员' : '启用成员',
              onClick: () => setPendingStatus({ user: record, next: record.status === 0 ? 1 : 0 }),
            },
          ]}
        />
      ),
    },
  ];

  const activeIndex = STATUS_OPTIONS.findIndex((option) => option.value === status);

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          这里列出平台里的成员、他们所属的部门与账号状态；调整角色、停用与启用都在这里完成。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
          <Button type="primary" icon={<AddOutlined />} onClick={() => setCreating(true)}>
            新增成员
          </Button>
        </div>
      </div>

      {/* 统计卡即筛选入口：点哪张卡切到对应状态，总数卡切回全部 */}
      <section className="ui-stats" aria-label="成员概览">
        {stats.map((item) => (
          <button
            type="button"
            className={`ui-stat ui-stat--${item.tone}${status === item.filter ? ' is-active' : ''}`}
            key={item.label}
            aria-pressed={status === item.filter}
            onClick={() => setStatus(item.filter)}
          >
            <span className="ui-stat__label">{item.label}</span>
            <span className="ui-stat__value ui-num">{item.value}</span>
          </button>
        ))}
      </section>

      <section className="ui-section" aria-label="成员明细">
        <Card className="ui-card ui-card--flush" title="全部成员">
          {view.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : view.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载成员列表</h3>
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
                  placeholder="搜索姓名、账号或部门"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
                <div className="ui-segments" role="group" aria-label="按状态筛选">
                  <SegmentedControl
                    texts={STATUS_OPTIONS.map((option) => option.label)}
                    activeIndex={activeIndex}
                    onChange={(index) => setStatus(STATUS_OPTIONS[index].value)}
                  />
                </div>
                <span className="ui-toolbar__count">共 {rows.length} 位成员</span>
              </div>
              <Table<UserRow>
                rowKey="id"
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: '没有找到相关成员，试试换个关键词或切换状态。' }}
              />
            </>
          )}
        </Card>
      </section>

      <UserEditDialog
        open={creating || editing !== null}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          reload();
        }}
      />

      <RoleAssignDialog
        open={assigning !== null}
        user={assigning}
        onClose={() => setAssigning(null)}
        onSaved={() => {
          setAssigning(null);
          reload();
        }}
      />

      {/* 停用 / 启用确认：独立 update-status 端点，不动其他资料 */}
      <Modal
        open={pendingStatus !== null}
        title={pendingStatus?.next === 1 ? '停用成员' : '启用成员'}
        okText={pendingStatus?.next === 1 ? '确认停用' : '确认启用'}
        cancelText="取消"
        confirmLoading={busy}
        onOk={confirmStatus}
        onCancel={() => setPendingStatus(null)}
      >
        <p>
          {pendingStatus?.next === 1
            ? `停用后「${pendingStatus?.user.nickname || pendingStatus?.user.username}」无法再登录平台，资料与角色保留，可以随时重新启用。`
            : `启用后「${pendingStatus?.user.nickname || pendingStatus?.user.username}」恢复登录与使用。`}
        </p>
      </Modal>
    </div>
  );
}
