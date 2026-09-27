import { useEffect, useState } from 'react';
import { Modal, Tree, message } from 'dingtalk-design-desktop';
import { assignRoleMenus, fetchMenus, fetchRoleMenus } from '../../api/yudao';
import type { MenuRow, RoleRow } from '../../api/yudao';

/**
 * 角色功能配置对话框（批次 H Step 4）：menu/list 全量树（目录/菜单作分组，
 * 按钮型节点是真正的权限叶子），勾选集保存到 assign-role-menu。
 *
 * Yudao 的存取口径（批次 H 计划风险 2，测试锁死）：
 * - 回读 list-role-menus 返回「勾选节点 + 全部祖先」的 id 集；
 * - 直接喂给受控 checkedKeys 会把半选祖先当全选、连带勾上未授权的兄弟节点；
 * - 因此回显先做「全后代都在集合内才算勾选」的收缩，展示层半选由 Tree 自行派生；
 * - 提交反向操作：勾选集沿 parentId 上溯合并祖先 id——漏并父节点会整枝丢勾。
 */

interface MenuPermDialogProps {
  open: boolean;
  role: RoleRow | null;
  onClose: () => void;
  onSaved: () => void;
}

/** dtd 根出口不导出树的 DataNode 类型：结构兼容的本地节点形状即可（title/key/children）。 */
interface MenuNode {
  title: string;
  key: number;
  children?: MenuNode[];
}

function groupChildren(menus: MenuRow[]): Map<number, MenuRow[]> {
  const byParent = new Map<number, MenuRow[]>();
  for (const menu of menus) {
    const bucket = byParent.get(menu.parentId) ?? [];
    bucket.push(menu);
    byParent.set(menu.parentId, bucket);
  }
  return byParent;
}

/** 扁平菜单表 → 嵌套树（title 只给人话名，权限码不上屏）。 */
function buildMenuTree(menus: MenuRow[]): MenuNode[] {
  const byParent = groupChildren(menus);
  const attach = (parentId: number): MenuNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((menu) => {
        const children = attach(menu.id);
        return { title: menu.name, key: menu.id, ...(children.length ? { children } : {}) };
      });
  return attach(0);
}

/** Yudao 回读集 → Tree 的受控勾选集：全后代都在集合内的节点才算勾选。 */
function completeChecked(granted: number[], menus: MenuRow[]): number[] {
  const grantedSet = new Set(granted);
  const childrenOf = groupChildren(menus);
  const isComplete = (menu: MenuRow): boolean =>
    grantedSet.has(menu.id) && (childrenOf.get(menu.id) ?? []).every(isComplete);
  return menus.filter(isComplete).map((menu) => menu.id);
}

/** 勾选集 → 提交集：沿 parentId 上溯合并祖先（Yudao 存父节点 id）。 */
function withAncestors(checked: number[], menus: MenuRow[]): number[] {
  const parentOf = new Map(menus.map((menu) => [menu.id, menu.parentId]));
  const merged = new Set(checked);
  for (const id of checked) {
    let parent = parentOf.get(id) ?? 0;
    while (parent !== 0) {
      merged.add(parent);
      parent = parentOf.get(parent) ?? 0;
    }
  }
  return [...merged];
}

export default function MenuPermDialog({ open, role, onClose, onSaved }: MenuPermDialogProps) {
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [checked, setChecked] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !role) return;
    let cancelled = false;
    setLoading(true);
    setMenus([]);
    setChecked([]);
    Promise.all([fetchMenus(), fetchRoleMenus(role.id)])
      .then(([menuRows, menuIds]) => {
        if (cancelled) return;
        setMenus(menuRows);
        setChecked(completeChecked(menuIds, menuRows));
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          message.error(error instanceof Error ? error.message : '功能清单暂时没有加载出来。');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, role]);

  async function handleOk() {
    if (!role || saving) return;
    setSaving(true);
    try {
      await assignRoleMenus(role.id, withAncestors(checked, menus));
      message.success('角色的可用功能已更新。');
      onSaved();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存没有成功，请稍后再试。');
    } finally {
      setSaving(false);
    }
  }

  const treeData = loading ? [] : buildMenuTree(menus);

  return (
    <Modal
      open={open && Boolean(role)}
      title={`配置可用功能：${role?.name ?? ''}`}
      okText="保存配置"
      cancelText="取消"
      confirmLoading={saving}
      onOk={handleOk}
      onCancel={onClose}
    >
      {loading ? (
        <p>正在加载功能清单…</p>
      ) : menus.length === 0 ? (
        <p>还没有可配置的功能清单。</p>
      ) : (
        // 菜单数据就绪后才挂 Tree：defaultExpandAll 只在挂载时生效，先空挂会收起全树
        <Tree
          checkable
          defaultExpandAll
          checkedKeys={checked}
          onCheck={(keys) => setChecked(keys as number[])}
          treeData={treeData}
        />
      )}
    </Modal>
  );
}
