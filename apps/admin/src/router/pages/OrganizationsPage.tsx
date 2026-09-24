import { Button, Card, Space, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined, DeleteOutlined, OrganizationOutlined, WriteEditOutlined } from 'dd-icons';
import { DEMO_ORGANIZATIONS, STATUS_META } from '../../store/demoDirectory';
import type { DemoOrganization } from '../../store/demoDirectory';

/**
 * 组织列表：组织的层级决定了数据能看到哪一层。
 *
 * 组织数据同样只读；调整组织结构会直接影响每个人的可见范围，
 * 在没有真实数据来源时开放这个入口风险太高，因此一律禁用。
 */

const SCOPE_RULES = [
  { name: '全部数据', desc: '可以查看整个企业范围内的组织、成员与应用。' },
  { name: '本部门及以下', desc: '可以查看自己所在部门，以及下属各部门的数据。' },
  { name: '本部门', desc: '只能查看自己所在部门的数据，看不到其他部门。' },
  { name: '仅本人负责的商品', desc: '只能查看与自己直接相关的商品与素材。' },
];

const columns: TableColumnsType<DemoOrganization> = [
  {
    title: '组织',
    dataIndex: 'name',
    key: 'name',
    render: (_, record) => (
      <span>
        <span className="admin-cell-title">{record.name}</span>
        <span className="admin-cell-sub">{record.type}</span>
      </span>
    ),
  },
  {
    title: '上级组织',
    dataIndex: 'parentName',
    key: 'parentName',
    width: 160,
  },
  {
    title: '成员数',
    dataIndex: 'memberCount',
    key: 'memberCount',
    width: 100,
    render: (value: number) => <span className="admin-num">{value}</span>,
  },
  {
    title: '可用应用数',
    dataIndex: 'appCount',
    key: 'appCount',
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
          icon={<OrganizationOutlined />}
          disabled
          aria-label={`调整 ${record.name} 的下级组织（暂不可用）`}
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

export default function OrganizationsPage() {
  return (
    <>
      <div className="admin-pagehead">
        <div className="admin-pagehead__row">
          <div>
            <h1 className="admin-pagehead__title">组织</h1>
            <p className="admin-pagehead__lead">
              组织是划分数据范围的依据：成员属于哪个组织，就决定了他默认能看到哪些数据。
            </p>
          </div>
          <div className="admin-pagehead__actions">
            <Button type="primary" icon={<AddOutlined />} disabled>
              新增组织（暂不可用）
            </Button>
          </div>
        </div>
      </div>

      <section className="admin-section" aria-label="组织明细">
        <Card
          title="全部组织"
          extra={<span className="admin-toolbar__count">共 {DEMO_ORGANIZATIONS.length} 个</span>}
          bodyStyle={{ padding: 0 }}
        >
          <Table<DemoOrganization>
            rowKey="id"
            columns={columns}
            dataSource={DEMO_ORGANIZATIONS}
            pagination={false}
          />
        </Card>
      </section>

      <section className="admin-section" aria-label="数据范围规则">
        <Card title="数据范围怎么划分">
          <ul className="admin-scope-list">
            {SCOPE_RULES.map((rule) => (
              <li key={rule.name}>
                <Tag color="blue" size="small">
                  {rule.name}
                </Tag>
                <p>{rule.desc}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </>
  );
}
