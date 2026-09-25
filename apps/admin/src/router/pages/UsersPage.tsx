import { useMemo, useState } from 'react';
import { Button, Card, Input, SegmentedControl, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined, LinkmanOutlined } from 'dd-icons';
import { DEMO_USERS_VIEW, STATUS_META } from '../../store/demoDirectory';
import type { DemoStatus, DemoUser } from '../../store/demoDirectory';
import RowActions from '../parts/RowActions';

/**
 * 用户列表：谁在这个平台里、属于哪个组织、被分配了什么角色。
 *
 * 四态骨架（2026-09-25 批次二）：页面只认 DEMO_USERS_VIEW 的形状，
 * 演示数据永远 success，loading / error 由测试喂形状覆盖。
 *
 * 列表只读：新增、编辑、调整角色、停用全部禁用，因为后台没有可写入的服务。
 * 通讯录同步同样禁用——同步会把真实人员数据拉进来，与「不含真实业务数据」直接冲突。
 *
 * 版式与交互（批次二/四）：
 * - 统计卡可点：点哪张卡切到对应状态筛选（aria-pressed 表达选中），总数卡切回全部；
 * - 「最近登录」可排序，默认最近在前；「从未登录」排最后（它是最旧的一档，
 *   不是空值异常），小字弱化避免被当成日期解析；
 * - 分页 10 条一页且单页隐藏；操作列用 RowActions（文字主操作 + ··· 下拉）。
 *
 * 成员一列把姓名与账号叠成两行（账号是小字副标题），角色一列用标签组。
 */

type StatusFilter = 'all' | DemoStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: STATUS_META.active.label },
  { value: 'invited', label: STATUS_META.invited.label },
  { value: 'disabled', label: STATUS_META.disabled.label },
];

/** 排序键：时间串 'YYYY-MM-DD HH:mm' 字典序即时间序；从未登录视为最旧。 */
function loginRank(user: DemoUser): string {
  return user.lastLoginAt === '从未登录' ? '' : user.lastLoginAt;
}

export default function UsersPage() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const view = DEMO_USERS_VIEW;
  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return view.data.filter((user) => {
      if (status !== 'all' && user.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [user.name, user.account, user.orgName, ...user.roleNames].some((field) =>
        field.toLowerCase().includes(query),
      );
    });
  }, [keyword, status, view.data]);

  const stats = useMemo(() => {
    const countBy = (target: DemoStatus) => view.data.filter((user) => user.status === target).length;
    return [
      { label: '成员总数', value: view.data.length, tone: 'brand', filter: 'all' as StatusFilter },
      { label: STATUS_META.active.label, value: countBy('active'), tone: 'success', filter: 'active' as StatusFilter },
      { label: STATUS_META.invited.label, value: countBy('invited'), tone: 'warning', filter: 'invited' as StatusFilter },
      { label: STATUS_META.disabled.label, value: countBy('disabled'), tone: 'neutral', filter: 'disabled' as StatusFilter },
    ];
  }, [view.data]);

  const columns: TableColumnsType<DemoUser> = [
    {
      title: '成员',
      dataIndex: 'name',
      key: 'name',
      render: (_, record) => (
        <span>
          <span className="ui-cell-title">{record.name}</span>
          <span className="ui-cell-sub">账号 {record.account}</span>
        </span>
      ),
    },
    {
      title: '所属组织',
      dataIndex: 'orgName',
      key: 'orgName',
      width: 156,
    },
    {
      title: '担任角色',
      key: 'roles',
      render: (_, record) => (
        <span className="ui-chips">
          {record.roleNames.map((role) => (
            <Tag key={role} color="blue" size="small">
              {role}
            </Tag>
          ))}
        </span>
      ),
    },
    {
      title: '最近登录',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      width: 156,
      sorter: (a, b) => loginRank(a).localeCompare(loginRank(b)),
      defaultSortOrder: 'descend',
      render: (value: string) => (
        <span className={value === '从未登录' ? 'admin-cell-muted' : 'ui-num'}>{value}</span>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 108,
      render: (_, record) => {
        const meta = STATUS_META[record.status];
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
              disabled: true,
              ariaLabel: `编辑 ${record.name} 的资料（暂不可用）`,
            },
            {
              key: 'roles',
              label: '调整角色',
              disabled: true,
              reason: '后台服务尚未接入，暂不可用',
            },
            {
              key: 'disable',
              label: '停用成员',
              disabled: true,
              reason: '后台服务尚未接入，暂不可用',
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
          这里列出平台里的成员、他们所属的组织和担任的角色。登录开通后，成员名单会跟随企业通讯录自动更新。
        </p>
        <div className="ui-pagehead__actions">
          <Button icon={<LinkmanOutlined />} disabled>
            同步通讯录（暂不可用）
          </Button>
          <Button type="primary" icon={<AddOutlined />} disabled>
            新增成员（暂不可用）
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
                <Button onClick={() => window.location.reload()}>重试</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="ui-toolbar">
                <Input
                  className="ui-toolbar__search"
                  allowClear
                  placeholder="搜索姓名、账号、组织或角色"
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
              <Table<DemoUser>
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
    </div>
  );
}
