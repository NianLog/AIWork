import { useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Radio, Table, Tag, message } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import {
  deleteFeedback,
  fetchFeedbacks,
  FEEDBACK_TYPE_LABEL,
  updateFeedback,
} from '../../api/yudao';
import type { FeedbackRow } from '../../api/yudao';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';

/**
 * 用户反馈（批次 Q）：门户端提交、本页查看与标记处理。
 *
 * 反馈内容是用户写的，管理端只做两件事：标记处理（可附备注）与删除。
 * 「待处理」计数放在工具条文案里，处理完刷新即走。
 */

export default function FeedbackPage() {
  const { view, reload } = useAdminData(fetchFeedbacks);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState<FeedbackRow | null>(null);
  const [resolveStatus, setResolveStatus] = useState<'0' | '1'>('1');
  const [resolveRemark, setResolveRemark] = useState('');
  const [pendingDelete, setPendingDelete] = useState<FeedbackRow | null>(null);

  const pendingCount = useMemo(() => view.data.filter((row) => row.status === 0).length, [view.data]);

  const columns: TableColumnsType<FeedbackRow> = useMemo(
    () => [
      {
        title: '类型',
        dataIndex: 'type',
        width: 88,
        render: (type: FeedbackRow['type']) => (
          <Tag color={type === 'bug' ? 'red' : type === 'suggestion' ? 'blue' : 'default'}>
            {FEEDBACK_TYPE_LABEL[type]}
          </Tag>
        ),
      },
      {
        title: '内容',
        dataIndex: 'content',
        ellipsis: true,
      },
      {
        title: '关联应用',
        dataIndex: 'appId',
        width: 150,
        render: (appId?: string) => (
          <span className="admin-cell-muted">{appId ?? '平台整体'}</span>
        ),
      },
      {
        title: '处理状态',
        dataIndex: 'status',
        width: 104,
        render: (_, record) =>
          record.status === 1 ? (
            <Tag color="green">已处理</Tag>
          ) : (
            <Tag color="orange">待处理</Tag>
          ),
      },
      { title: '提交时间', dataIndex: 'createTime', width: 160 },
      {
        title: '操作',
        key: 'actions',
        width: 148,
        render: (_, record) => (
          <RowActions
            actions={[
              {
                key: 'resolve',
                label: record.status === 1 ? '调整处理' : '标记处理',
                onClick: () => {
                  setResolving(record);
                  // 打开即默认「已处理」：这条动作的主语义就是标记处理完。
                  setResolveStatus('1');
                  setResolveRemark(record.remark ?? '');
                },
              },
              {
                key: 'delete',
                label: '删除反馈',
                onClick: () => setPendingDelete(record),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  function openDetail(record: FeedbackRow) {
    return (
      <div>
        <p>{record.content}</p>
        {record.contact ? <p className="admin-cell-muted">联系方式：{record.contact}</p> : null}
      </div>
    );
  }

  async function confirmResolve() {
    if (!resolving) return;
    setBusy(true);
    try {
      await updateFeedback({
        id: resolving.id,
        status: resolveStatus === '1' ? 1 : 0,
        remark: resolveRemark.trim() || undefined,
      });
      message.success('反馈处理状态已更新。');
      setResolving(null);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '更新没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteFeedback(pendingDelete.id);
      message.success('反馈已删除。');
      setPendingDelete(null);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          用户在门户提交的反馈都汇在这里。{pendingCount > 0 ? `当前有 ${pendingCount} 条待处理。` : '当前没有待处理的反馈。'}
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
        </div>
      </div>

      <section className="ui-section" aria-label="反馈明细">
        <Card
          className="ui-card ui-card--flush"
          title="全部反馈"
          extra={<span className="ui-toolbar__count">共 {view.data.length} 条</span>}
        >
          {view.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : view.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载反馈列表</h3>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={reload}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<FeedbackRow>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: '还没有用户提交反馈。' }}
              expandable={{ expandedRowRender: openDetail }}
            />
          )}
        </Card>
      </section>

      <Modal
        title="标记处理"
        open={resolving !== null}
        confirmLoading={busy}
        onOk={confirmResolve}
        onCancel={() => setResolving(null)}
        okText="保存"
      >
        {resolving ? (
          <div className="admin-login__form">
            <p className="ui-form-hint">{resolving.content}</p>
            <label className="ui-field">
              <span className="ui-field__label">处理状态</span>
              <Radio.Group
                value={resolveStatus}
                onChange={(event) => setResolveStatus(event.target.value)}
              >
                <Radio value="0">待处理</Radio>
                <Radio value="1">已处理</Radio>
              </Radio.Group>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">处理备注（可选）</span>
              <Input.TextArea
                value={resolveRemark}
                maxLength={512}
                rows={3}
                placeholder="例如：已排进下个迭代 / 已修复，预计随 0.2.1 发布"
                onChange={(event) => setResolveRemark(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="删除反馈"
        open={pendingDelete !== null}
        confirmLoading={busy}
        onOk={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        okText="确认删除"
        okButtonProps={{ danger: true }}
      >
        <p>确定删除这条反馈？删除后无法恢复。</p>
      </Modal>
    </div>
  );
}
