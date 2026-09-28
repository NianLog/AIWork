import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Table,
  Tag,
  message,
} from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import {
  ROADMAP_STAGE_LABEL,
  createRoadmapItem,
  deleteRoadmapItem,
  fetchRoadmapItems,
  updateRoadmapItem,
} from '../../api/yudao';
import type { RoadmapInput, RoadmapRow, RoadmapStage } from '../../api/yudao';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';

/**
 * 功能进展（批次 R）：进展条目的唯一维护入口，直接驱动门户「功能进展」页
 * 与工作台速览（此前是硬编码 TS 数组，改内容要发版）。
 *
 * 管理端用单表 + 阶段列（不是三栏分组卡片）：这里是 CRUD 工具，十来条数据
 * 一屏扫完比分组滚动快；看板式的分组展示是门户 StatusPage 的职责。
 * 日期控件用原生 input[type=date]：值即 yyyy-MM-dd，与后端契约零转换。
 */

const STAGE_TAG_COLOR: Record<RoadmapStage, string | undefined> = {
  0: undefined,
  1: 'blue',
  2: 'green',
};

interface FormState {
  id?: number;
  name: string;
  description: string;
  stage: RoadmapStage;
  progress: number;
  startDate: string;
  dueDate: string;
  sort: number;
}

const EMPTY_FORM: FormState = {
  name: '',
  description: '',
  stage: 0,
  progress: 0,
  startDate: '',
  dueDate: '',
  sort: 0,
};

export default function RoadmapPage() {
  const { view, reload } = useAdminData(fetchRoadmapItems);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RoadmapRow | null>(null);

  const stats = useMemo(() => {
    const acc: Record<RoadmapStage, number> = { 0: 0, 1: 0, 2: 0 };
    view.data.forEach((row) => {
      acc[row.stage] += 1;
    });
    return acc;
  }, [view.data]);

  const columns: TableColumnsType<RoadmapRow> = useMemo(
    () => [
      {
        title: '条目',
        dataIndex: 'name',
        width: 240,
        render: (_, record) => (
          <span className="ui-cell-strong">
            {record.name}
            {record.description ? (
              <span className="admin-cell-muted admin-cell-muted--block">{record.description}</span>
            ) : null}
          </span>
        ),
      },
      {
        title: '阶段',
        dataIndex: 'stage',
        width: 96,
        render: (_, record) => (
          <Tag color={STAGE_TAG_COLOR[record.stage]}>{ROADMAP_STAGE_LABEL[record.stage]}</Tag>
        ),
      },
      {
        title: '进度',
        dataIndex: 'progress',
        width: 180,
        render: (_, record) => <Progress percent={record.progress} size="small" />,
      },
      {
        title: '起止日期',
        key: 'dates',
        width: 210,
        render: (_, record) =>
          record.startDate || record.dueDate ? (
            <span className="admin-cell-muted ui-num">
              {record.startDate ?? '—'} ~ {record.dueDate ?? '—'}
            </span>
          ) : (
            <span className="admin-cell-muted">未排期</span>
          ),
      },
      { title: '排序', dataIndex: 'sort', width: 80 },
      {
        title: '操作',
        key: 'actions',
        width: 132,
        render: (_, record) => (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: '编辑',
                ariaLabel: `编辑条目 ${record.name}`,
                onClick: () =>
                  setEditing({
                    id: record.id,
                    name: record.name,
                    description: record.description ?? '',
                    stage: record.stage,
                    progress: record.progress,
                    startDate: record.startDate ?? '',
                    dueDate: record.dueDate ?? '',
                    sort: record.sort,
                  }),
              },
              {
                key: 'delete',
                label: '删除条目',
                onClick: () => setPendingDelete(record),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteRoadmapItem(pendingDelete.id);
      message.success('条目已删除。');
      setPendingDelete(null);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  async function submitForm() {
    if (!editing) return;
    if (!editing.name.trim()) {
      message.error('条目名称不能为空。');
      return;
    }
    setBusy(true);
    try {
      const payload: RoadmapInput = {
        id: editing.id,
        name: editing.name.trim(),
        description: editing.description.trim() || undefined,
        stage: editing.stage,
        progress: editing.progress,
        startDate: editing.startDate || undefined,
        dueDate: editing.dueDate || undefined,
        sort: editing.sort,
      };
      if (editing.id) {
        await updateRoadmapItem(payload);
        message.success('条目已更新，门户进展页随即生效。');
      } else {
        await createRoadmapItem(payload);
        message.success('条目已创建，门户进展页随即生效。');
      }
      setEditing(null);
      reload();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          这里的条目就是门户「功能进展」页和工作台速览的全部内容。进行中的条目建议填开始日期与
          预计完成日期，门户会自动算出已进行天数；阶段内的「排序」小者靠前。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
          <Button type="primary" icon={<AddOutlined />} onClick={() => setEditing({ ...EMPTY_FORM })}>
            新增条目
          </Button>
        </div>
      </div>

      <section className="ui-section" aria-label="进展条目">
        <Card
          className="ui-card ui-card--flush"
          title="全部条目"
          extra={
            <span className="ui-toolbar__count">
              已完成 {stats[2]} · 进行中 {stats[1]} · 规划中 {stats[0]}
            </span>
          }
        >
          {view.status === 'loading' ? (
            <div className="ui-table-skeleton" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span className="ui-skeleton ui-skeleton--line" key={index} />
              ))}
            </div>
          ) : view.status === 'error' ? (
            <div className="ui-errorstate" role="alert">
              <h3 className="ui-errorstate__title">无法加载进展条目</h3>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={reload}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<RoadmapRow>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={false}
              locale={{ emptyText: '还没有条目，新增第一条让门户进展页开张。' }}
            />
          )}
        </Card>
      </section>

      <Modal
        title={editing?.id ? '编辑条目' : '新增条目'}
        open={editing !== null}
        confirmLoading={busy}
        onOk={submitForm}
        onCancel={() => setEditing(null)}
        okText={editing?.id ? '保存' : '创建'}
        destroyOnClose
      >
        {editing ? (
          <div className="admin-login__form">
            <label className="ui-field">
              <span className="ui-field__label">名称</span>
              <Input
                value={editing.name}
                maxLength={64}
                placeholder="一句话说清这件事，例如：使用统计"
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">说明</span>
              <Input.TextArea
                value={editing.description}
                maxLength={500}
                rows={2}
                placeholder="可选。补充范围或验收口径。"
                onChange={(event) => setEditing({ ...editing, description: event.target.value })}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">阶段</span>
              <Radio.Group
                value={String(editing.stage)}
                onChange={(event) =>
                  setEditing({ ...editing, stage: Number(event.target.value) as RoadmapStage })
                }
              >
                <Radio value="0">规划中</Radio>
                <Radio value="1">进行中</Radio>
                <Radio value="2">已完成</Radio>
              </Radio.Group>
            </label>
            <div className="ui-field">
              <span className="ui-field__label">进度（%）</span>
              <InputNumber
                min={0}
                max={100}
                value={editing.progress}
                onChange={(value) => setEditing({ ...editing, progress: value ?? 0 })}
              />
            </div>
            <div className="admin-form-grid">
              <label className="ui-field">
                <span className="ui-field__label">开始日期</span>
                <input
                  type="date"
                  className="ui-field__native"
                  value={editing.startDate}
                  onChange={(event) => setEditing({ ...editing, startDate: event.target.value })}
                />
              </label>
              <label className="ui-field">
                <span className="ui-field__label">预计完成日期</span>
                <input
                  type="date"
                  className="ui-field__native"
                  value={editing.dueDate}
                  onChange={(event) => setEditing({ ...editing, dueDate: event.target.value })}
                />
              </label>
            </div>
            <div className="ui-field">
              <span className="ui-field__label">阶段内排序（小者靠前）</span>
              <InputNumber
                min={0}
                value={editing.sort}
                onChange={(value) => setEditing({ ...editing, sort: value ?? 0 })}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="删除条目"
        open={pendingDelete !== null}
        confirmLoading={busy}
        onOk={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        okText="确认删除"
        okButtonProps={{ danger: true }}
      >
        <p>
          确定删除「{pendingDelete?.name}」？门户进展页会同步消失这一条，这一步不能撤销。
        </p>
      </Modal>
    </div>
  );
}
