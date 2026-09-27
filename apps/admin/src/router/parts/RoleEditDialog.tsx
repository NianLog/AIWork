import { useEffect, useState } from 'react';
import { Input, Modal, Select, message } from 'dingtalk-design-desktop';
import { createRole, updateRole } from '../../api/yudao';
import type { RoleRow } from '../../api/yudao';
import { ROLE_DATA_SCOPES } from '../../store/domain';

/**
 * 角色新增 / 编辑对话框（批次 H Step 4）：新增走 createRole（code 创建后禁改，
 * 与用户页账号同口径）；编辑走 updateRole 整行展开再覆盖——status/dataScope
 * 不在表单里时由 api 层用行数据保活，避免 PUT 全量语义清空。
 * 数据范围决定担任者能读到哪一层数据，标签见 ROLE_DATA_SCOPES。
 */

interface RoleEditDialogProps {
  open: boolean;
  /** null = 新增模式；有值 = 编辑该角色。 */
  role: RoleRow | null;
  onClose: () => void;
  /** 保存成功后的回调（页面刷新列表）。 */
  onSaved: () => void;
}

export default function RoleEditDialog({ open, role, onClose, onSaved }: RoleEditDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [dataScope, setDataScope] = useState(1);
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? '');
    setCode(role?.code ?? '');
    setDataScope(role?.dataScope ?? 1);
    setRemark(role?.remark ?? '');
  }, [open, role]);

  async function handleOk() {
    if (saving) return;
    if (!name.trim()) {
      message.warning('请先填写：角色名。');
      return;
    }
    if (!role && !code.trim()) {
      message.warning('请先填写：角色编码。');
      return;
    }
    setSaving(true);
    try {
      if (role) {
        await updateRole(role, {
          name: name.trim(),
          dataScope,
          remark: remark.trim(),
        });
        message.success('角色已保存。');
      } else {
        await createRole({
          name: name.trim(),
          code: code.trim(),
          sort: 0,
          status: 0,
          dataScope,
          remark: remark.trim(),
        });
        message.success('角色已创建。');
      }
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存没有成功，请稍后再试。');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={role ? `编辑角色：${role.name}` : '新增角色'}
      okText={role ? '保存' : '创建角色'}
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
    >
      <div className="ui-form-grid">
        <label className="ui-field">
          <span className="ui-field__label">角色名</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：巡检管理员"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">
            角色编码
            <span>{role ? '编码创建后不可修改' : '程序内引用的英文标识'}</span>
          </span>
          <Input
            value={code}
            disabled={Boolean(role)}
            onChange={(event) => setCode(event.target.value)}
            placeholder="例如：patrol_admin"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">数据范围</span>
          <Select
            value={dataScope}
            options={ROLE_DATA_SCOPES}
            onChange={(value) => setDataScope(value)}
          />
        </label>

        <label className="ui-field ui-field--full">
          <span className="ui-field__label">备注</span>
          <Input.TextArea
            rows={2}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="选填，比如这组角色面向谁"
          />
        </label>
      </div>
    </Modal>
  );
}
