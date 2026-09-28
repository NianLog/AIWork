import { useMemo, useState } from 'react';
import { Button, Card, Input, Table } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { fetchOperateLogs } from '../../api/yudao';
import type { OperateLogItem } from '../../api/yudao';
import SegmentedField from '../parts/SegmentedField';
import { useAdminData } from '../parts/useAdminData';

/**
 * 操作日志（批次 U）：yudao system 模块 operate-log 的只读视图，/preview/audit。
 *
 * 数据直连 /admin-api/system/operate-log/page（权限 system:operate-log:query，
 * 菜单种子见后端 sql/mysql/manual/portal-operate-log-menu.sql）。门户写操作
 * 统一「门户」前缀，范围筛选按前缀模拟匹配；关键词在前端对描述与操作人
 * 做二次过滤。一次拉 100 条客户端分页——审计是低频写操作，量级远够。
 */
type LogScope = 'all' | 'portal';

const SCOPE_OPTIONS: Array<{ value: LogScope; label: string }> = [
  { value: 'all', label: '全部模块' },
  { value: 'portal', label: '仅门户' },
];

function formatTime(value: number | string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AuditPage() {
  const [scope, setScope] = useState<LogScope>('all');
  const [keyword, setKeyword] = useState('');
  // scope 参与内联 fetcher 闭包：切换时 setScope + reload 批量重渲染，
  // effect 读到的 fetcherRef.current 已是新闭包（useAdminData 契约）。
  // fetchOperateLogs 本身返回数组，直接给它——不要再包一层数组契约。
  const { view, reload } = useAdminData(
    () => fetchOperateLogs(scope === 'portal' ? '门户' : undefined),
  );

  const logs: OperateLogItem[] = view.status === 'success' ? view.data : [];

  const rows = useMemo(() => {
    const kw = keyword.trim();
    if (!kw) return logs;
    return logs.filter(
      (item) => (item.action ?? '').includes(kw) || (item.userName ?? '').includes(kw),
    );
  }, [logs, keyword]);

  const columns: TableColumnsType<OperateLogItem> = useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'createTime',
        width: 150,
        render: (value: number | string) => <span className="ui-num">{formatTime(value)}</span>,
      },
      {
        title: '操作人',
        dataIndex: 'userName',
        width: 110,
        render: (_value: unknown, record: OperateLogItem) =>
          record.userName || <span className="admin-cell-muted">—</span>,
      },
      { title: '模块', dataIndex: 'type', width: 110 },
      { title: '动作', dataIndex: 'subType', width: 80 },
      { title: '描述', dataIndex: 'action' },
      {
        title: 'IP',
        dataIndex: 'userIp',
        width: 140,
        render: (_value: unknown, record: OperateLogItem) =>
          record.userIp || <span className="admin-cell-muted">—</span>,
      },
    ],
    [],
  );

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          记录管理后台的每次写操作：谁在什么时候改了什么。门户功能的操作可在右侧筛选出「仅门户」范围。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
        </div>
      </div>

      {view.status === 'loading' ? (
        <section className="ui-section" aria-label="操作日志加载中">
          <Card className="ui-card" title="操作日志">
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          </Card>
        </section>
      ) : view.status === 'error' ? (
        <section className="ui-section" aria-label="操作日志加载失败">
          <div className="ui-errorstate" role="alert">
            <h3 className="ui-errorstate__title">无法加载操作日志</h3>
            <p className="ui-errorstate__desc">
              {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
            </p>
            <div className="ui-errorstate__actions">
              <Button onClick={reload}>重试</Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="ui-section" aria-label="操作日志列表">
          <Card
            className="ui-card ui-card--flush"
            title="操作日志"
            extra={<span className="ui-toolbar__count">{rows.length} 条记录</span>}
          >
            <div className="ui-toolbar">
              <Input
                className="ui-toolbar__search"
                allowClear
                placeholder="搜索操作描述或操作人"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <SegmentedField
                label="按模块范围筛选"
                options={SCOPE_OPTIONS}
                value={scope}
                onChange={(next) => {
                  setScope(next);
                  reload();
                }}
              />
            </div>
            <Table<OperateLogItem>
              rowKey="id"
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: '还没有操作记录。' }}
            />
          </Card>
        </section>
      )}
    </div>
  );
}
