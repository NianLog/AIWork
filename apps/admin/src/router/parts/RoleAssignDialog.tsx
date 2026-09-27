import { useEffect, useState } from 'react';
import { Checkbox, Modal, message } from 'dingtalk-design-desktop';
import { assignUserRoles, fetchRoles, fetchUserRoles } from '../../api/yudao';
import type { RoleRow, UserRow } from '../../api/yudao';

/**
 * 成员角色分配对话框（批次 H Step 3）：打开时并行拉「该用户当前的角色 id」
 * 与「全部角色」回显勾选，保存提交 assignUserRoles 全量覆盖。
 * 列表页不逐行查角色（N+1 规避，见批次 H 计划决策 3），角色信息只在
 * 需要调整时进入这张对话框。
 */

interface RoleAssignDialogProps {
  open: boolean;
  user: UserRow | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function RoleAssignDialog({ open, user, onClose, onSaved }: RoleAssignDialogProps) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [checked, setChecked] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    setLoading(true);
    setRoles([]);
    setChecked([]);
    Promise.all([fetchUserRoles(user.id), fetchRoles()])
      .then(([roleIds, roleRows]) => {
        if (cancelled) return;
        setChecked(roleIds);
        setRoles(roleRows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : '角色信息暂时没有加载出来。');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  async function handleOk() {
    if (!user || saving) return;
    setSaving(true);
    try {
      await assignUserRoles(user.id, checked);
      message.success('成员的角色已更新。');
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存没有成功，请稍后再试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open && Boolean(user)}
      title={`调整角色：${(user?.nickname || user?.username) ?? ''}`}
      okText="保存分配"
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
    >
      {loading ? (
        <p>正在加载角色列表…</p>
      ) : roles.length === 0 ? (
        <p>还没有可以分配的角色。</p>
      ) : (
        <Checkbox.Group
          value={checked}
          onChange={(values) => setChecked(values as number[])}
          options={roles.map((role) => ({ label: role.name, value: role.id }))}
        />
      )}
    </Modal>
  );
}
