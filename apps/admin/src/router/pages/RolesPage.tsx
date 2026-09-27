import { useMemo, useState } from 'react';
import { Button, Card, Modal, Table, Tag, message } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import {
  deleteRole,
  fetchAppPermissions,
  fetchApplications,
  fetchRoles,
} from '../../api/yudao';
import type { ApplicationRow, AppPermissionRow, RoleRow } from '../../api/yudao';
import { ENTITY_STATUS_META, roleDataScopeLabel } from '../../store/domain';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';
import RoleEditDialog from '../parts/RoleEditDialog';
import MenuPermDialog from '../parts/MenuPermDialog';

/**
 * 角色列表（批次 H Step 4 真实化）：/system/role/page 经 useAdminData 装载。
 *
 * 列砍「担任人数 / 可用功能数」：前者接口无来源（要逐角色查成员，N+1），
 * 后者是演示编造。真实列：角色名 / 数据范围（人话映射）/ 备注 / 状态两态。
 * 角色编码不上屏（内部标识）；编辑对话框里才可见可改（新增时）。
 *
 * 写操作解禁：新增/编辑（RoleEditDialog）、配置可用功能（MenuPermDialog，
 * 菜单树勾选 + 父节点合并口径见该文件头）、删除（确认后 deleteRole；
 * 内置角色后端拒绝，报错如实上屏）。
 *
 * 下方权限卡接 portal-app-permission/page + portal-app/page 按 appId 分组：
 * 应用对外提供了哪些功能，给角色勾权限时可以对照着看。
 */

/** 权限卡的单对象装载：DataView 契约是数组，组合两源时用单元素数组承载。 */
interface PermOverview {
  apps: ApplicationRow[];
  permissions: AppPermissionRow[];
}

async function fetchPermOverview(): Promise<PermOverview[]> {
  const [apps, permissions] = await Promise.all([fetchApplications(), fetchAppPermissions()]);
  return [{ apps, permissions }];
}

export default function RolesPage() {
  const { view, reload } = useAdminData(fetchRoles);
  const { view: permsView, reload: reloadPerms } = useAdminData(fetchPermOverview);

  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState<RoleRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoleRow | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteRole(pendingDelete.id);
      message.success('角色已删除。');
      setPendingDelete(null);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  const columns: TableColumnsType<RoleRow> = useMemo(
    () => [
      {
        title: '角色',
        dataIndex: 'name',
        key: 'name',
        render: (value: string) => <span className="ui-cell-title">{value}</span>,
      },
      {
        title: '数据范围',
        dataIndex: 'dataScope',
        key: 'dataScope',
        width: 156,
        render: (value: number) => <span>{roleDataScopeLabel(value)}</span>,
      },
      {
        title: '备注',
        dataIndex: 'remark',
        key: 'remark',
        render: (value: string) => <span>{value || '—'}</span>,
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
                key: 'perms',
                label: '配置可用功能',
                onClick: () => setConfiguring(record),
              },
              {
                key: 'delete',
                label: '删除角色',
                onClick: () => setPendingDelete(record),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const overview = permsView.data[0];

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          角色决定一个人能做什么、能看到哪一层数据。给成员分配合适的角色，就不必逐个功能单独授权。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
          <Button type="primary" icon={<AddOutlined />} onClick={() => setCreating(true)}>
            新增角色
          </Button>
        </div>
      </div>

      <section className="ui-section" aria-label="角色明细">
        <Card
          className="ui-card ui-card--flush"
          title="全部角色"
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
              <h3 className="ui-errorstate__title">无法加载角色列表</h3>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={reload}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<RoleRow>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: '还没有角色，先创建一个再给成员分配。' }}
            />
          )}
        </Card>
      </section>

      <section className="ui-section" aria-label="各应用的可用功能">
        <Card className="ui-card" title="各应用的可用功能">
          <p className="ui-form-hint">
            下面是每个应用当前对外提供的功能。给角色勾选其中的若干项，担任该角色的成员就能使用这些功能。
          </p>
          {permsView.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : permsView.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载功能清单</h3>
              <p className="ui-errorstate__desc">
                {permsView.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={reloadPerms}>重试</Button>
              </div>
            </div>
          ) : overview ? (
            <div className="admin-perm-grid">
              {overview.apps.map((app) => {
                const permissions = overview.permissions.filter(
                  (permission) => permission.appId === app.appId,
                );
                return (
                  <div className="admin-perm-card" key={app.appId}>
                    <p className="admin-perm-card__title">
                      {app.name}
                      <span className="admin-perm-card__count ui-num">{permissions.length}</span>
                    </p>
                    {permissions.length > 0 ? (
                      <div className="ui-chips">
                        {permissions.map((permission) => (
                          <Tag key={permission.id} size="small">
                            {permission.name}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <p className="ui-form-hint">暂未登记功能</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </Card>
      </section>

      <RoleEditDialog
        open={creating || editing !== null}
        role={editing}
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

      <MenuPermDialog
        open={configuring !== null}
        role={configuring}
        onClose={() => setConfiguring(null)}
        onSaved={() => setConfiguring(null)}
      />

      {/* 删除确认：内置角色会被后端拒绝，报错按真实口径上屏 */}
      <Modal
        open={pendingDelete !== null}
        title="删除角色"
        okText="确认删除"
        cancelText="取消"
        confirmLoading={busy}
        onOk={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        <p>
          删除后「{pendingDelete?.name}」不可恢复，担任它的成员会立即失去这组能力。
          确定要删除吗？
        </p>
      </Modal>
    </div>
  );
}
