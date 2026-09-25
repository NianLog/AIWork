import { Button, Card, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined, DeleteOutlined, OrganizationOutlined, WriteEditOutlined } from 'dd-icons';
import { DEMO_ORGANIZATIONS, STATUS_META } from '../../store/demoDirectory';
import type { DemoOrganization } from '../../store/demoDirectory';

/**
 * 组织列表：组织的层级决定了数据能看到哪一层。
 *
 * 组织数据同样只读；调整组织结构会直接影响每个人的可见范围，
 * 在没有真实数据来源时开放这个入口风险太高，因此一律禁用。
 *
 * 版式取舍：四条数据范围规则从「标签 + 说明」的竖列表改成两列网格，
 * 每条一句话讲清边界；规则之间是并列关系，并排比纵向堆叠更容易横向比较。
 */

const SCOPE_RULES = [
  {
    name: '全部数据',
    desc: '可以查看整个企业范围内的组织、成员与应用。',
  },
  {
    name: '本部门及以下',
    desc: '可以查看自己所在部门，以及下属各部门的数据。',
  },
  {
    name: '本部门',
    desc: '只能查看自己所在部门的数据，看不到其他部门。',
  },
  {
    name: '仅本人负责的商品',
    desc: '只能查看与自己直接相关的商品与素材。',
  },
];

const columns: TableColumnsType<DemoOrganization> = [
  {
    title: '组织',
    dataIndex: 'name',
    key: 'name',
    render: (_, record) => (
      <span>
        <span className="ui-cell-title">{record.name}</span>
        <span className="ui-cell-sub">{record.type}</span>
      </span>
    ),
  },
  {
    title: '上级组织',
    dataIndex: 'parentName',
    key: 'parentName',
    width: 156,
  },
  {
    title: '成员数',
    dataIndex: 'memberCount',
    key: 'memberCount',
    width: 100,
    render: (value: number) => <span className="ui-num">{value}</span>,
  },
  {
    title: '可用应用数',
    dataIndex: 'appCount',
    key: 'appCount',
    width: 116,
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
      </span>
    ),
  },
];

export default function OrganizationsPage() {
  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          组织是划分数据范围的依据：成员属于哪个组织，就决定了他默认能看到哪些数据。
        </p>
        <div className="ui-pagehead__actions">
          <Button type="primary" icon={<AddOutlined />} disabled>
            新增组织（暂不可用）
          </Button>
        </div>
      </div>

      <section className="ui-section" aria-label="组织明细">
        <Card
          className="ui-card ui-card--flush"
          title="全部组织"
          extra={<span className="ui-toolbar__count">共 {DEMO_ORGANIZATIONS.length} 个</span>}
        >
          <Table<DemoOrganization>
            rowKey="id"
            columns={columns}
            dataSource={DEMO_ORGANIZATIONS}
            pagination={false}
          />
        </Card>
      </section>

      <section className="ui-section" aria-label="数据范围规则">
        <Card className="ui-card" title="数据范围怎么划分">
          <ul className="admin-scope-grid">
            {SCOPE_RULES.map((rule) => (
              <li className="admin-scope-item" key={rule.name}>
                <span className="admin-scope-item__head">
                  <span className="ui-badge ui-badge--info">{rule.name}</span>
                </span>
                <p className="admin-scope-item__desc">{rule.desc}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}