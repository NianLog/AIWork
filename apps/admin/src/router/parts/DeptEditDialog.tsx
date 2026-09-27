import { useEffect, useMemo, useState } from 'react';
import { Input, Modal, TreeSelect, message } from 'dingtalk-design-desktop';
import { createDept, fetchDepts, updateDept } from '../../api/yudao';
import type { DeptRow } from '../../api/yudao';

/**
 * 组织新增 / 编辑对话框（批次 H Step 5）：上级组织用 TreeSelect 选（demo 版
 * 「调整下级组织」独立操作取消，归属这里）；编辑时排除自己与后代——
 * 把自己挂到子孙下面会成环，后端会拒，前端先不给这个选项。
 * 负责人（leaderUserId）只有裸 id 无姓名来源，不上屏不编辑，由 api 层整行保活。
 */

interface DeptEditDialogProps {
  open: boolean;
  /** null = 新增模式；有值 = 编辑该组织。 */
  dept: DeptRow | null;
  onClose: () => void;
  /** 保存成功后的回调（页面刷新列表）。 */
  onSaved: () => void;
}

/** rc-tree-select 原生节点口径（label/value/children），不赌 title 别名。 */
interface DeptTreeNode {
  label: string;
  value: number;
  children?: DeptTreeNode[];
}

function buildDeptTree(depts: DeptRow[], excluded: Set<number>): DeptTreeNode[] {
  const byParent = new Map<number, DeptRow[]>();
  for (const dept of depts) {
    if (excluded.has(dept.id)) continue;
    const bucket = byParent.get(dept.parentId) ?? [];
    bucket.push(dept);
    byParent.set(dept.parentId, bucket);
  }
  const attach = (parentId: number): DeptTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((dept) => {
        const children = attach(dept.id);
        return { label: dept.name, value: dept.id, ...(children.length ? { children } : {}) };
      });
  return attach(0);
}

export default function DeptEditDialog({ open, dept, onClose, onSaved }: DeptEditDialogProps) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(0);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [depts, setDepts] = useState<DeptRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(dept?.name ?? '');
    setParentId(dept?.parentId ?? 0);
    setPhone(dept?.phone ?? '');
    setEmail(dept?.email ?? '');
    fetchDepts()
      .then(setDepts)
      .catch(() => setDepts([]));
  }, [open, dept]);

  /** 编辑时排除自己与全部后代：允许选中等于允许成环。 */
  const excluded = useMemo(() => {
    const ids = new Set<number>();
    if (!dept) return ids;
    ids.add(dept.id);
    let growing = true;
    while (growing) {
      growing = false;
      for (const row of depts) {
        if (!ids.has(row.id) && ids.has(row.parentId)) {
          ids.add(row.id);
          growing = true;
        }
      }
    }
    return ids;
  }, [dept, depts]);

  async function handleOk() {
    if (saving) return;
    if (!name.trim()) {
      message.warning('请先填写：组织名。');
      return;
    }
    setSaving(true);
    try {
      if (dept) {
        await updateDept(dept, {
          name: name.trim(),
          parentId,
          phone: phone.trim(),
          email: email.trim(),
        });
        message.success('组织已保存。');
      } else {
        await createDept({
          name: name.trim(),
          parentId,
          sort: 0,
          // Yudao DeptSaveReqVO 的 status @NotNull（e2e 实证：缺省即 400「状态不能为空」），
          // 创建动线没有状态开关，创建即启用。
          status: 0,
          phone: phone.trim(),
          email: email.trim(),
        });
        message.success('组织已创建。');
      }
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存没有成功，请稍后再试。');
    } finally {
      setSaving(false);
    }
  }

  const treeData = useMemo(() => {
    const children = buildDeptTree(depts, excluded);
    return [{ label: '作为顶级组织', value: 0, ...(children.length ? { children } : {}) }];
  }, [depts, excluded]);

  return (
    <Modal
      open={open}
      title={dept ? `编辑组织：${dept.name}` : '新增组织'}
      okText={dept ? '保存' : '创建组织'}
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
    >
      <div className="ui-form-grid">
        <label className="ui-field">
          <span className="ui-field__label">组织名</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：巡检组"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">上级组织</span>
          <TreeSelect
            value={parentId}
            treeData={treeData}
            treeDefaultExpandAll
            onChange={(value) => setParentId(value as number)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">电话</span>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="选填"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">邮箱</span>
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="选填"
          />
        </label>
      </div>
    </Modal>
  );
}
