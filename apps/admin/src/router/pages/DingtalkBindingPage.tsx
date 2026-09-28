import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Table } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { bindDingtalk, fetchDingtalkBindings, fetchUsers, unbindDingtalk } from '../../api/yudao';
import type { DingtalkBindingItem, UserRow } from '../../api/yudao';
import { useAdminData } from '../parts/useAdminData';

/**
 * 钉钉绑定管理（批次 X）：工作通知「发给谁」的 userid 映射，/preview/dingtalk。
 *
 * 绑定是发（工作通知）/免登/收消息三者的共同前置，通道凭据后补期间即可先行
 * 录入——钉钉通道启用前，通知仍只走站内信（页面文案明示，不制造「绑了就
 * 会推钉钉」的错觉）。用户下拉用原生 select：绑定量级小，可测性与可及性
 * 比自定义下拉的视觉收益更重要；昵称由前端拿用户列表 join（后端不拼展示字段）。
 */
function formatTime(value: number | string | undefined): string {
  if (value === undefined) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DingtalkBindingPage() {
  const { view, reload } = useAdminData(fetchDingtalkBindings);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userId, setUserId] = useState<number | undefined>();
  const [dingtalkUserid, setDingtalkUserid] = useState('');
  const [bindNote, setBindNote] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);

  // 用户列表是绑定表单的增益数据：拉失败只是没有下拉，不拦绑定列表渲染
  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        /* 静默：表单退化为手填编号不可用（见下） */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = view.status === 'success' ? view.data : [];
  const nicknameById = useMemo(() => new Map(users.map((u) => [u.id, u.nickname])), [users]);
  // 下拉只列未绑定的用户：已绑定走「换绑」语义是低频操作，列表行内解绑后再绑即可
  const unboundOptions = useMemo(
    () => users.filter((u) => !rows.some((r) => r.userId === u.id)),
    [users, rows],
  );

  async function submitBind(): Promise<void> {
    if (userId == null || !dingtalkUserid.trim()) return;
    setBinding(true);
    setBindNote(null);
    try {
      await bindDingtalk(userId, dingtalkUserid.trim());
      setUserId(undefined);
      setDingtalkUserid('');
      reload();
    } catch (error) {
      setBindNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBinding(false);
    }
  }

  async function removeBinding(row: DingtalkBindingItem): Promise<void> {
    setBindNote(null);
    try {
      await unbindDingtalk(row.userId);
      reload();
    } catch (error) {
      setBindNote(error instanceof Error ? error.message : String(error));
    }
  }

  const columns: TableColumnsType<DingtalkBindingItem> = [
    { title: '平台用户', dataIndex: 'userId', render: (_value: unknown, record: DingtalkBindingItem) => nicknameById.get(record.userId) ?? `#${record.userId}` },
    { title: '钉钉 userid', dataIndex: 'dingtalkUserid' },
    { title: '更新时间', dataIndex: 'updateTime', render: (_value: unknown, record: DingtalkBindingItem) => formatTime(record.updateTime) },
    {
      title: '操作',
      key: 'actions',
      render: (_value: unknown, record: DingtalkBindingItem) => (
        <Button type="link" danger onClick={() => void removeBinding(record)}>
          解绑
        </Button>
      ),
    },
  ];

  return (
    <div className="ui-page">
      <section className="ui-section" aria-label="钉钉绑定说明">
        <Card className="ui-card" title="钉钉绑定（工作通知前置）">
          <p className="ui-note">
            绑定平台用户与钉钉 userid 后，钉钉工作通知通道可按人私发。
            通道企业凭据配置前，绑定仅作数据准备，通知仍只发站内信。
          </p>
        </Card>
      </section>

      <section className="ui-section" aria-label="新增绑定">
        <Card className="ui-card ui-card--flush" title="新增绑定 / 换绑">
          <div className="ui-form-grid">
            <label className="ui-field">
              <span className="ui-field__label">平台用户</span>
              <select
                aria-label="平台用户"
                value={userId ?? ''}
                onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">选择用户</option>
                {unboundOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nickname}（{u.username}）
                  </option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">钉钉 userid</span>
              <Input
                allowClear
                placeholder="钉钉开放平台通讯录里的 userid"
                value={dingtalkUserid}
                onChange={(e) => setDingtalkUserid(e.target.value)}
              />
            </label>
          </div>
          <div className="ui-errorstate__actions">
            <Button type="primary" loading={binding} disabled={userId == null || !dingtalkUserid.trim()} onClick={() => void submitBind()}>
              绑定
            </Button>
          </div>
          {bindNote ? (
            <p className="ui-note" role="alert">
              {bindNote}
            </p>
          ) : null}
        </Card>
      </section>

      {view.status === 'loading' ? (
        <section className="ui-section" aria-label="绑定列表加载中">
          <Card className="ui-card" title="已绑定账号">
            <p className="ui-note">加载中…</p>
          </Card>
        </section>
      ) : view.status === 'error' ? (
        <section className="ui-section" aria-label="绑定列表加载失败">
          <div className="ui-errorstate" role="alert">
            <h3 className="ui-errorstate__title">无法加载钉钉绑定</h3>
            <p className="ui-errorstate__desc">{view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}</p>
            <div className="ui-errorstate__actions">
              <Button onClick={reload}>重试</Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="ui-section" aria-label="绑定列表">
          <Card
            className="ui-card ui-card--flush"
            title="已绑定账号"
            extra={<span className="ui-toolbar__count">{rows.length} 条绑定</span>}
          >
            <Table
              rowKey="id"
              columns={columns}
              dataSource={rows}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
            />
          </Card>
        </section>
      )}
    </div>
  );
}
