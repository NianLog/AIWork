import { useMemo, useState } from 'react';
import { Button, Card, Modal, Table, Tag, message } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import { deleteDept, fetchDepts } from '../../api/yudao';
import type { DeptRow } from '../../api/yudao';
import { ENTITY_STATUS_META } from '../../store/domain';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';
import DeptEditDialog from '../parts/DeptEditDialog';

/**
 * 组织列表（批次 H Step 5 真实化）：/system/dept/list 全量树经 useAdminData 装载。
 *
 * 列砍「成员数 / 可用应用数」（接口无来源，演示编造）：真实列是
 * 组织 / 上级组织（parentId → 名称本地映射，顶级显示「—」）/ 联系方式
 * （邮箱优先否则电话）/ 状态两态。负责人只有裸 id 无姓名来源，不上屏（批次 H 决策）。
 *
 * 写操作解禁：新增/编辑（DeptEditDialog，上级组织 TreeSelect 选、编辑时排除
 * 自己子树防环）、删除（确认后 deleteDept；有下级/有成员会被后端拒绝，如实上屏）。
 *
 * 下方数据范围说明卡保留（与角色页 ROLE_DATA_SCOPES 同一套口径的科普），
 * 「仅本人负责的商品」这类演示期文案已修正为本平台语境。
 */

const SCOPE_RULES = [
  {
    name: '全部数据',
    desc: '可以查看整个企业范围内的组织、成员与应用。',
  },
  {
    name: '指定部门',
    desc: '只能查看明确指定的若干部门的数据，部门列表由角色配置。',
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
    name: '仅本人',
    desc: '只能查看与自己直接相关的数据。',
  },
];

export default function OrganizationsPage() {
  const { view, reload } = useAdminData(fetchDepts);

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<DeptRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DeptRow | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteDept(pendingDelete.id);
      message.success('组织已删除。');
      setPendingDelete(null);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  const columns: TableColumnsType<DeptRow> = useMemo(() => {
    const nameOf = (id: number) => view.data.find((dept) => dept.id === id)?.name;
    return [
      {
        title: '组织',
        dataIndex: 'name',
        key: 'name',
        render: (value: string) => <span className="ui-cell-title">{value}</span>,
      },
      {
        title: '上级组织',
        dataIndex: 'parentId',
        key: 'parentId',
        width: 156,
        render: (value: number) => <span>{nameOf(value) ?? '—'}</span>,
      },
      {
        title: '联系方式',
        key: 'contact',
        width: 176,
        render: (_, record) => (
          <span className="ui-num">{record.email || record.phone || '—'}</span>
        ),
      },
      {
        title: '状态',
        key: 'status',
        width: 108,
        render: (_, record) => {
          const meta = ENTITY_STATUS_META[record.status];
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
                ariaLabel: `编辑 ${record.name}`,
                onClick: () => setEditing(record),
              },
              {
                key: 'delete',
                label: '删除组织',
                onClick: () => setPendingDelete(record),
              },
            ]}
          />
        ),
      },
    ];
  }, [view.data]);

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          组织是划分数据范围的依据：成员属于哪个组织，就决定了他默认能看到哪些数据。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
          <Button type="primary" icon={<AddOutlined />} onClick={() => setCreating(true)}>
            新增组织
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
                <Button onClick={reload}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<DeptRow>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: '还没有组织，先创建一个再给成员分配。' }}
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

      <DeptEditDialog
        open={creating || editing !== null}
        dept={editing}
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

      {/* 删除确认：存在下级或成员时后端拒绝，报错按真实口径上屏 */}
      <Modal
        open={pendingDelete !== null}
        title="删除组织"
        okText="确认删除"
        cancelText="取消"
        confirmLoading={busy}
        onOk={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          删除后「{pendingDelete?.name}」下的成员归属需要重新安排。
          仍有下级组织或成员时后端会拒绝删除。确定要删除吗？
        </p>
      </Modal>
    </div>
  );
}
