import { useEffect, useState } from 'react';
import { Input, Modal, Select, message } from 'dingtalk-design-desktop';
import { createUser, fetchDepts, updateUser } from '../../api/yudao';
import type { UserRow } from '../../api/yudao';

/**
 * 成员新增 / 编辑对话框（批次 H Step 3）：新增走 createUser（必须给初始密码），
 * 编辑走 updateUser 整行展开再覆盖（账号是登录标识，创建后禁改）。
 * 部门下拉来自组织全量树 fetchDepts；sex/postIds 等界面上没有的字段由
 * updateUser 的整行合并保活，不经过这张表单。
 */

interface UserEditDialogProps {
  open: boolean;
  /** null = 新增模式；有值 = 编辑该成员。 */
  user: UserRow | null;
  onClose: () => void;
  /** 保存成功后的回调（页面刷新列表）。 */
  onSaved: () => void;
}

export default function UserEditDialog({ open, user, onClose, onSaved }: UserEditDialogProps) {
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deptId, setDeptId] = useState<number | undefined>(undefined);
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [remark, setRemark] = useState('');
  const [deptOptions, setDeptOptions] = useState<Array<{ value: number; label: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNickname(user?.nickname ?? '');
    setUsername(user?.username ?? '');
    setPassword('');
    setDeptId(user?.deptId ?? undefined);
    setMobile(user?.mobile ?? '');
    setEmail(user?.email ?? '');
    setRemark(user?.remark ?? '');
    fetchDepts()
      .then((depts) => setDeptOptions(depts.map((dept) => ({ value: dept.id, label: dept.name }))))
      .catch(() => setDeptOptions([]));
  }, [open, user]);

  async function handleOk() {
    if (saving) return;
    if (!nickname.trim()) {
      message.warning('请先填写：姓名。');
      return;
    }
    if (!user && !username.trim()) {
      message.warning('请先填写：账号。');
      return;
    }
    if (!user && !password.trim()) {
      message.warning('请先填写：初始密码。');
      return;
    }
    setSaving(true);
    try {
      if (user) {
        await updateUser(user, {
          nickname: nickname.trim(),
          deptId,
          mobile: mobile.trim(),
          email: email.trim(),
          remark: remark.trim(),
        });
        message.success('成员资料已保存。');
      } else {
        await createUser({
          username: username.trim(),
          nickname: nickname.trim(),
          password,
          deptId,
          mobile: mobile.trim(),
          email: email.trim(),
          remark: remark.trim(),
        });
        message.success('成员已创建，可以用账号和初始密码登录。');
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
      title={user ? `编辑成员：${user.nickname || user.username}` : '新增成员'}
      okText={user ? '保存' : '创建成员'}
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
    >
      <div className="ui-form-grid">
        <label className="ui-field">
          <span className="ui-field__label">姓名</span>
          <Input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="成员的真实姓名"
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">
            账号
            <span>{user ? '账号创建后不可修改' : '登录用的账号名'}</span>
          </span>
          <Input
            value={username}
            disabled={Boolean(user)}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="例如：linwei"
          />
        </label>

        {!user ? (
          <label className="ui-field">
            <span className="ui-field__label">初始密码</span>
            <Input.Password
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="成员首次登录使用，登录后可自行修改"
            />
          </label>
        ) : null}

        <label className="ui-field">
          <span className="ui-field__label">所属部门</span>
          <Select
            value={deptId}
            options={deptOptions}
            placeholder="选择部门"
            onChange={(value) => setDeptId(value)}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">手机号</span>
          <Input
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
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

        <label className="ui-field ui-field--full">
          <span className="ui-field__label">备注</span>
          <Input.TextArea
            rows={2}
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
            placeholder="选填，比如这个成员的职责说明"
          />
        </label>
      </div>
    </Modal>
  );
}
