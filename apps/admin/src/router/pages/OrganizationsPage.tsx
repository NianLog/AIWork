import { useMemo } from 'react';
import { Button, Card, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import { DEMO_ORGS_VIEW, STATUS_META } from '../../store/demoDirectory';
import type { DemoOrganization } from '../../store/demoDirectory';
import RowActions from '../parts/RowActions';

/**
 * 组织列表：组织的层级决定了数据能看到哪一层。
 *
 * 四态骨架（2026-09-25 批次二）：页面只认 DEMO_ORGS_VIEW 的形状，演示数据永远 success。
 *
 * 组织数据同样只读；调整组织结构会直接影响每个人的可见范围，
 * 在没有真实数据来源时开放这个入口风险太高，因此一律禁用。
 *
 * 版式取舍：四条数据范围规则从「标签 + 说明」的竖列表改成两列网格，
 * 每条一句话讲清边界；规则之间是并列关系，并排比纵向堆叠更容易横向比较。
 *
 * 交互（批次四）：成员数可排序（默认最多在前）；分页 10 条一页且单页隐藏；
 * 操作列用 RowActions（文字主操作 + ··· 下拉收纳）。
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

export default function OrganizationsPage() {
  const view = DEMO_ORGS_VIEW;

  const columns: TableColumnsType<DemoOrganization> = useMemo(
    () => [
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
        sorter: (a, b) => a.memberCount - b.memberCount,
        defaultSortOrder: 'descend',
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
                key: 'suborg',
                label: '调整下级组织',
                disabled: true,
                reason: '后台服务尚未接入，暂不可用',
              },
              {
                key: 'delete',
                label: '删除组织',
                disabled: true,
                reason: '后台服务尚未接入，暂不可用',
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

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
          extra={<span className="ui-toolbar__count">共 {view.data.length} 个</span>}
        >
          {view.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : view.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载组织列表</h3>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={() => window.location.reload()}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<DemoOrganization>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          )}
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
