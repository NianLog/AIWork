import { useMemo } from 'react';
import { Button, Card, Table, Tag } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import { DEMO_APPLICATIONS_VIEW, DEMO_ROLES_VIEW, STATUS_META } from '../../store/demoDirectory';
import type { DemoRole } from '../../store/demoDirectory';
import RowActions from '../parts/RowActions';

/**
 * 角色列表：一个角色就是一组「能做什么」的集合，成员通过担任角色获得能力。
 *
 * 四态骨架（2026-09-25 批次二）：页面只认 *_VIEW 的形状，演示数据永远 success。
 *
 * 页面只展示角色名称、数据范围与数量，不展示内部标识；下方另起一卡，
 * 按应用罗列每个应用当前提供的功能，方便理解「权限」到底指什么。
 *
 * 版式取舍：权限清单从「每个应用一段、纵向排到底」改成两列网格（宽屏），
 * 每个应用一张浅底小卡，功能用标签列出。原来十来个应用纵向铺开，
 * 想比较两个应用各有哪些功能必须来回滚动。
 *
 * 交互（批次四）：担任人数可排序（默认最多的在前——「谁覆盖面最大」是这张表
 * 最常被问的问题）；分页 10 条一页且单页隐藏；操作列用 RowActions。
 */

export default function RolesPage() {
  const view = DEMO_ROLES_VIEW;
  const appsView = DEMO_APPLICATIONS_VIEW;

  const columns: TableColumnsType<DemoRole> = useMemo(
    () => [
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
        sorter: (a, b) => a.memberCount - b.memberCount,
        defaultSortOrder: 'descend',
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
                key: 'perms',
                label: '配置可用功能',
                disabled: true,
                reason: '后台服务尚未接入，暂不可用',
              },
              {
                key: 'delete',
                label: '删除角色',
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
                <Button onClick={() => window.location.reload()}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<DemoRole>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          )}
        </Card>
      </section>

      <section className="ui-section" aria-label="各应用的可用功能">
        <Card className="ui-card" title="各应用的可用功能">
          <p className="ui-form-hint">
            下面是每个应用当前对外提供的功能。给角色勾选其中的若干项，担任该角色的成员就能使用这些功能。
          </p>
          {appsView.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : appsView.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载功能清单</h3>
              <p className="ui-errorstate__desc">
                {appsView.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={() => window.location.reload()}>重试</Button>
              </div>
            </div>
          ) : (
            <div className="admin-perm-grid">
              {appsView.data.map((app) => (
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
          )}
        </Card>
      </section>
    </div>
  );
}
