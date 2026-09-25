import { Button, Card, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined, DeleteOutlined, SafeOutlined, WriteEditOutlined } from 'dd-icons';
import { DEMO_APPLICATIONS, DEMO_ROLES, STATUS_META } from '../../store/demoDirectory';
import type { DemoRole } from '../../store/demoDirectory';

/**
 * 角色列表：一个角色就是一组「能做什么」的集合，成员通过担任角色获得能力。
 *
 * 页面只展示角色名称、数据范围与数量，不展示内部标识；下方另起一卡，
 * 按应用罗列每个应用当前提供的功能，方便理解「权限」到底指什么。
 *
 * 版式取舍：权限清单从「每个应用一段、纵向排到底」改成两列网格（宽屏），
 * 每个应用一张浅底小卡，功能用标签列出。原来十来个应用纵向铺开，
 * 想比较两个应用各有哪些功能必须来回滚动。
 */

const columns: TableColumnsType<DemoRole> = [
  {
    title: '角色',
    dataIndex: 'name',
    key: 'name',
    render: (value: string) => <span className="ui-cell-title">{value}</span>,
  },
  {
    title: '数据范围',
    dataIndex: 'scope',
    key: 'scope',
    width: 156,
  },
  {
    title: '担任人数',
    dataIndex: 'memberCount',
    key: 'memberCount',
    width: 108,
    render: (value: number) => <span className="ui-num">{value}</span>,
  },
  {
    title: '可用功能数',
    dataIndex: 'permissionCount',
    key: 'permissionCount',
    width: 120,
    render: (value: number) => <span className="ui-num">{value}</span>,
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
          aria-label={`编辑 ${record.name}（暂不可用）`}
        />
        <Button
          size="small"
          type="text"
          icon={<SafeOutlined />}
          disabled
          aria-label={`配置 ${record.name} 的可用功能（暂不可用）`}
        />
        <Button
          size="small"
          type="text"
          icon={<DeleteOutlined />}
          disabled
          aria-label={`删除 ${record.name}（暂不可用）`}
        />
      </span>
    ),
  },
];

export default function RolesPage() {
  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          角色决定一个人能做什么、能看到哪一层数据。给成员分配合适的角色，就不必逐个功能单独授权。
        </p>
        <div className="ui-pagehead__actions">
          <Button type="primary" icon={<AddOutlined />} disabled>
            新增角色（暂不可用）
          </Button>
        </div>
      </div>

      <section className="ui-section" aria-label="角色明细">
        <Card
          className="ui-card ui-card--flush"
          title="全部角色"
          extra={<span className="ui-toolbar__count">共 {DEMO_ROLES.length} 个</span>}
        >
          <Table<DemoRole>
            rowKey="id"
            columns={columns}
            dataSource={DEMO_ROLES}
            pagination={false}
          />
        </Card>
      </section>

      <section className="ui-section" aria-label="各应用的可用功能">
        <Card className="ui-card" title="各应用的可用功能">
          <p className="ui-form-hint">
            下面是每个应用当前对外提供的功能。给角色勾选其中的若干项，担任该角色的成员就能使用这些功能。
          </p>
          <div className="admin-perm-grid">
            {DEMO_APPLICATIONS.map((app) => (
              <div className="admin-perm-card" key={app.appId}>
                <p className="admin-perm-card__title">
                  {app.name}
                  <span className="admin-perm-card__count ui-num">{app.permissions.length}</span>
                </p>
                <div className="ui-chips">
                  {app.permissions.map((permission) => (
                    <Tag key={permission.code} size="small">
                      {permission.name}
                    </Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}