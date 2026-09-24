import { Button, Card, Space, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined, DeleteOutlined, SafeOutlined, WriteEditOutlined } from 'dd-icons';
import { DEMO_APPLICATIONS, DEMO_ROLES, STATUS_META } from '../../store/demoDirectory';
import type { DemoRole } from '../../store/demoDirectory';

/**
 * 角色列表：一个角色就是一组「能做什么」的集合，成员通过担任角色获得能力。
 *
 * 页面只展示角色名称、数据范围与数量，不展示内部标识；下方另起一卡，
 * 按应用罗列每个应用当前提供的功能，方便理解「权限」到底指什么。
 */

const columns: TableColumnsType<DemoRole> = [
  {
    title: '角色',
    dataIndex: 'name',
    key: 'name',
    render: (value: string) => <span className="admin-cell-title">{value}</span>,
  },
  {
    title: '数据范围',
    dataIndex: 'scope',
    key: 'scope',
    width: 160,
  },
  {
    title: '担任人数',
    dataIndex: 'memberCount',
    key: 'memberCount',
    width: 110,
    render: (value: number) => <span className="admin-num">{value}</span>,
  },
  {
    title: '可用功能数',
    dataIndex: 'permissionCount',
    key: 'permissionCount',
    width: 120,
    render: (value: number) => <span className="admin-num">{value}</span>,
  },
  {
    title: '状态',
    key: 'status',
    width: 110,
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
      </Space>
    ),
  },
];

export default function RolesPage() {
  return (
    <>
      <div className="admin-pagehead">
        <div className="admin-pagehead__row">
          <div>
            <h1 className="admin-pagehead__title">角色</h1>
            <p className="admin-pagehead__lead">
              角色决定一个人能做什么、能看到哪一层数据。给成员分配合适的角色，就不必逐个功能单独授权。
            </p>
          </div>
          <div className="admin-pagehead__actions">
            <Button type="primary" icon={<AddOutlined />} disabled>
              新增角色（暂不可用）
            </Button>
          </div>
        </div>
      </div>

      <section className="admin-section" aria-label="角色明细">
        <Card title="全部角色" extra={<span className="admin-toolbar__count">共 {DEMO_ROLES.length} 个</span>}>
          <Table<DemoRole>
            rowKey="id"
            columns={columns}
            dataSource={DEMO_ROLES}
            pagination={false}
          />
        </Card>
      </section>

      <section className="admin-section" aria-label="各应用的可用功能">
        <Card title="各应用的可用功能">
          <p className="admin-form-hint">
            下面是每个应用当前对外提供的功能。给角色勾选其中的若干项，担任该角色的成员就能使用这些功能。
          </p>
          {DEMO_APPLICATIONS.map((app) => (
            <div className="admin-perm-group" key={app.appId}>
              <p className="admin-perm-group__title">{app.name}</p>
              <div className="admin-chips">
                {app.permissions.map((permission) => (
                  <Tag key={permission.code} size="small">
                    {permission.name}
                  </Tag>
                ))}
              </div>
            </div>
          ))}
        </Card>
      </section>
    </>
  );
}
