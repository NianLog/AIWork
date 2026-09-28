import { useMemo } from 'react';
import { Button, Card, Table } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { fetchAccessStats } from '../../api/yudao';
import type { AccessAppItem, AccessStats } from '../../api/yudao';
import { useAdminData } from '../parts/useAdminData';

/**
 * 使用统计（批次 T）：访问日志的只读视图，/preview/stats。
 *
 * 趋势图用 CSS 条形而非图表库：dtd 没有图表组件，14 根柱子引 ECharts 是
 * 用大炮打蚊子；dataviz 纪律照守——细 mark、柱上直接标数（内部工具低量级，
 * 数字即数据）、按应用排行表格就是它的表格视图（读屏不靠颜色拿数）。
 *
 * 数据从后端部署本批次起积累，之前没有历史；只记打开不记停留（iframe 里
 * 拿不到可靠的离开信号）。useAdminData 收的是数组契约，这里把单份快照
 * 包一层数组复用它（401 跳登录/竞态取消/刷新语义白拿）。
 */
export default function StatsPage() {
  const { view, reload } = useAdminData(async () => [await fetchAccessStats(14)]);
  const stats: AccessStats | null = view.status === 'success' ? (view.data[0] ?? null) : null;

  const total = useMemo(
    () => stats?.daily.reduce((sum, item) => sum + item.count, 0) ?? 0,
    [stats],
  );
  const peak = useMemo(
    () => stats?.daily.reduce((max, item) => Math.max(max, item.count), 0) ?? 0,
    [stats],
  );

  const columns: TableColumnsType<AccessAppItem> = useMemo(
    () => [
      {
        title: '应用',
        dataIndex: 'name',
        render: (_, record) => (
          <span className="ui-cell-strong">
            {record.name}
            <span className="admin-cell-muted admin-cell-muted--block">{record.appId}</span>
          </span>
        ),
      },
      { title: '访问次数', dataIndex: 'count', width: 120, className: 'ui-num' },
      {
        title: '占比',
        key: 'share',
        width: 120,
        render: (_, record) =>
          total > 0 ? (
            <span className="ui-num">{Math.round((record.count / total) * 100)}%</span>
          ) : (
            <span className="admin-cell-muted">—</span>
          ),
      },
    ],
    [total],
  );

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          统计成员从门户打开子应用的次数，数据从本功能上线起积累。只记打开不记停留时长。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
        </div>
      </div>

      {view.status === 'loading' ? (
        <section className="ui-section" aria-label="使用统计加载中">
          <Card className="ui-card" title="近 14 天访问趋势">
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          </Card>
        </section>
      ) : view.status === 'error' ? (
        <section className="ui-section" aria-label="使用统计加载失败">
          <div className="ui-errorstate" role="alert">
            <h3 className="ui-errorstate__title">无法加载使用统计</h3>
            <p className="ui-errorstate__desc">
              {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
            </p>
            <div className="ui-errorstate__actions">
              <Button onClick={reload}>重试</Button>
            </div>
          </div>
        </section>
      ) : stats ? (
        <>
          <section className="ui-section" aria-label="近 14 天访问趋势">
            <Card
              className="ui-card"
              title="近 14 天访问趋势"
              extra={<span className="ui-toolbar__count">合计 {total} 次</span>}
            >
              {total === 0 ? (
                <p className="ui-note">
                  还没有访问记录。成员从门户打开子应用后，这里就会出现第一根柱子。
                </p>
              ) : (
                <ul
                  className="stats-bars"
                  role="img"
                  aria-label={`近 14 天共 ${total} 次访问，单日峰值 ${peak} 次`}
                >
                  {stats.daily.map((item) => (
                    <li key={item.date} className="stats-bars__col">
                      <span className="stats-bars__value ui-num">
                        {item.count > 0 ? item.count : ''}
                      </span>
                      <span className="stats-bars__track">
                        <span
                          className="stats-bars__bar"
                          style={{ height: `${Math.round((item.count / peak) * 100)}%` }}
                          title={`${item.date}：${item.count} 次`}
                        />
                      </span>
                      <span className="stats-bars__date ui-num">{item.date.slice(5)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <section className="ui-section" aria-label="按应用排行">
            <Card
              className="ui-card ui-card--flush"
              title="按应用排行"
              extra={<span className="ui-toolbar__count">{stats.byApp.length} 个应用有访问</span>}
            >
              <Table<AccessAppItem>
                rowKey="appId"
                columns={columns}
                dataSource={stats.byApp}
                pagination={false}
                locale={{ emptyText: '还没有访问记录。' }}
              />
            </Card>
          </section>
        </>
      ) : null}
    </div>
  );
}
