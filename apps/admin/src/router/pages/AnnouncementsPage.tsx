import { useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Radio, Table, Tag, message } from 'dingtalk-design-desktop';
import type { TableColumnsType } from 'dingtalk-design-desktop';
import { AddOutlined } from 'dd-icons';
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  updateAnnouncement,
} from '../../api/yudao';
import type { AnnouncementInput, AnnouncementRow } from '../../api/yudao';
import { ENTITY_STATUS_META } from '../../store/domain';
import RowActions from '../parts/RowActions';
import { useAdminData } from '../parts/useAdminData';

/**
 * 公告管理（批次 Q）：后台编辑、门户工作台右栏展示。
 *
 * 置顶公告恒排列表最前（后端 enabled-list 与本页排序一致）；停用只从门户
 * 隐藏，管理端仍可见可再启用——公告的「下线」语义不用删除表达。
 */

interface FormState {
  id?: number;
  title: string;
  content: string;
  pinned: boolean;
  status: 0 | 1;
}

const EMPTY_FORM: FormState = { title: '', content: '', pinned: false, status: 0 };

export default function AnnouncementsPage() {
  const { view, reload } = useAdminData(fetchAnnouncements);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AnnouncementRow | null>(null);

  const columns: TableColumnsType<AnnouncementRow> = useMemo(
    () => [
      {
        title: '标题',
        dataIndex: 'title',
        width: 280,
        render: (_, record) => (
          <span className="ui-cell-strong">
            {record.pinned ? <Tag color="blue" size="small">置顶</Tag> : null}
            {record.title}
          </span>
        ),
      },
      {
        title: '正文摘要',
        dataIndex: 'content',
        ellipsis: true,
        render: (content: string) => <span className="admin-cell-muted">{content}</span>,
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 96,
        render: (_, record) => {
          const meta = ENTITY_STATUS_META[record.status];
          return <Tag color={meta.tagColor}>{meta.label}</Tag>;
        },
      },
      { title: '发布时间', dataIndex: 'createTime', width: 160 },
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
                ariaLabel: `编辑公告 ${record.title}`,
                onClick: () =>
                  setEditing({
                    id: record.id,
                    title: record.title,
                    content: record.content,
                    pinned: record.pinned,
                    status: record.status,
                  }),
              },
              {
                key: 'delete',
                label: '删除公告',
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
      await deleteAnnouncement(pendingDelete.id);
      message.success('公告已删除。');
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
    if (!editing.title.trim()) {
      message.error('公告标题不能为空。');
      return;
    }
    if (!editing.content.trim()) {
      message.error('公告正文不能为空。');
      return;
    }
    setBusy(true);
    try {
      const payload: AnnouncementInput = {
        id: editing.id,
        title: editing.title.trim(),
        content: editing.content.trim(),
        pinned: editing.pinned,
        status: editing.status,
      };
      if (editing.id) {
        await updateAnnouncement(payload);
        message.success('公告已更新。');
      } else {
        await createAnnouncement(payload);
        message.success('公告已发布，门户工作台即可见。');
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
          公告会展示在门户工作台右侧，适合发布维护通知、新功能上线这类需要全员知道的消息。
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={reload}>刷新</Button>
          <Button type="primary" icon={<AddOutlined />} onClick={() => setEditing({ ...EMPTY_FORM })}>
            发布公告
          </Button>
        </div>
      </div>

      <section className="ui-section" aria-label="公告明细">
        <Card
          className="ui-card ui-card--flush"
          title="全部公告"
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
              <h3 className="ui-errorstate__title">无法加载公告列表</h3>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button onClick={reload}>重试</Button>
              </div>
            </div>
          ) : (
            <Table<AnnouncementRow>
              rowKey="id"
              columns={columns}
              dataSource={view.data}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              locale={{ emptyText: '还没有公告，发布第一条让门户页面更有生气。' }}
            />
          )}
        </Card>
      </section>

      <Modal
        title={editing?.id ? '编辑公告' : '发布公告'}
        open={editing !== null}
        confirmLoading={busy}
        onOk={submitForm}
        onCancel={() => setEditing(null)}
        okText={editing?.id ? '保存' : '发布'}
        destroyOnClose
      >
        {editing ? (
          <div className="admin-login__form">
            <label className="ui-field">
              <span className="ui-field__label">标题</span>
              <Input
                value={editing.title}
                maxLength={128}
                placeholder="一句话说清这件事，例如：平台周六凌晨例行维护"
                onChange={(event) => setEditing({ ...editing, title: event.target.value })}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">正文</span>
              <Input.TextArea
                value={editing.content}
                maxLength={5000}
                rows={5}
                placeholder="补充时间、影响范围与联系人。门户上会完整展示。"
                onChange={(event) => setEditing({ ...editing, content: event.target.value })}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field__label">置顶</span>
              <Radio.Group
                value={editing.pinned ? 'yes' : 'no'}
                onChange={(event) => setEditing({ ...editing, pinned: event.target.value === 'yes' })}
              >
                <Radio value="yes">置顶（恒排门户列表最前）</Radio>
                <Radio value="no">普通</Radio>
              </Radio.Group>
            </label>
            <label className="ui-field">
              <span className="ui-field__label">状态</span>
              <Radio.Group
                value={String(editing.status)}
                onChange={(event) =>
                  setEditing({ ...editing, status: event.target.value === '1' ? 1 : 0 })
                }
              >
                <Radio value="0">启用（门户可见）</Radio>
                <Radio value="1">停用（门户隐藏）</Radio>
              </Radio.Group>
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="删除公告"
        open={pendingDelete !== null}
        confirmLoading={busy}
        onOk={confirmDelete}
        onCancel={() => setPendingDelete(null)}
        okText="确认删除"
        okButtonProps={{ danger: true }}
      >
        <p>
          确定删除「{pendingDelete?.title}」？删除后门户上立即消失，这一步不能撤销。
        </p>
      </Modal>
    </div>
  );
}
