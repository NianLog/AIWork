import { useMemo, useState } from 'react';
import { Button, Card, Input, SegmentedControl, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined, DeleteOutlined, LinkmanOutlined, SafeOutlined, WriteEditOutlined } from 'dd-icons';
import { DEMO_USERS, STATUS_META } from '../../store/demoDirectory';
import type { DemoStatus, DemoUser } from '../../store/demoDirectory';

/**
 * 用户列表：谁在这个平台里、属于哪个组织、被分配了什么角色。
 *
 * 列表只读：新增、编辑、调整角色、停用全部禁用，因为后台没有可写入的服务。
 * 通讯录同步同样禁用——同步会把真实人员数据拉进来，与「不含真实业务数据」直接冲突。
 *
 * 版式取舍：成员一列把姓名与账号叠成两行（账号是小字副标题），
 * 角色一列用标签组；「最近登录」是全站唯一的空值场景（从未登录），
 * 用更浅的颜色弱化，避免读者把它当成一个日期去解析。
 */

type StatusFilter = 'all' | DemoStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'active', label: STATUS_META.active.label },
  { value: 'invited', label: STATUS_META.invited.label },
  { value: 'disabled', label: STATUS_META.disabled.label },
];

export default function UsersPage() {
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const rows = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    return DEMO_USERS.filter((user) => {
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
  }, [keyword, status]);

  const stats = useMemo(() => {
    const countBy = (target: DemoStatus) => DEMO_USERS.filter((user) => user.status === target).length;
    return [
      { label: '成员总数', value: DEMO_USERS.length, tone: 'brand' },
      { label: STATUS_META.active.label, value: countBy('active'), tone: 'success' },
      { label: STATUS_META.invited.label, value: countBy('invited'), tone: 'warning' },
      { label: STATUS_META.disabled.label, value: countBy('disabled'), tone: 'neutral' },
    ];
  }, []);

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
      width: 132,
      render: (_, record) => (
        <span className="ui-actions">
          <Button
            size="small"
            type="text"
            icon={<WriteEditOutlined />}
            disabled
            aria-label={`编辑 ${record.name} 的资料（暂不可用）`}
          />
          <Button
            size="small"
            type="text"
            icon={<SafeOutlined />}
            disabled
            aria-label={`调整 ${record.name} 的角色（暂不可用）`}
          />
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            disabled
            aria-label={`停用 ${record.name}（暂不可用）`}
          />
        </span>
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

      <section className="ui-stats" aria-label="成员概览">
        {stats.map((item) => (
          <div className={`ui-stat ui-stat--${item.tone}`} key={item.label}>
            <p className="ui-stat__label">{item.label}</p>
            <p className="ui-stat__value ui-num">{item.value}</p>
          </div>
        ))}
      </section>

      <section className="ui-section" aria-label="成员明细">
        <Card className="ui-card ui-card--flush" title="全部成员">
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
            pagination={false}
            locale={{ emptyText: '没有找到相关成员，试试换个关键词或切换状态。' }}
          />
        </Card>
      </section>
    </div>
  );
}