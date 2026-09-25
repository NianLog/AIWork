import { useState } from 'react';
import { Button, Dropdown } from 'dingtalk-design-desktop';
import type { MenuProps } from 'dingtalk-design-desktop';
import { MoreOutlined } from 'dd-icons';

/**
 * 表格行操作（2026-09-25 批次二）：一个主要动作 + 「···」收纳的次要动作。
 *
 * 为什么不再用三个图标按钮：图标按钮把「编辑 / 配置 / 停用」压成三个 16px 的
 * 图形，禁用态下连图形都读不出来，用户只能悬停猜。这里第一个动作用文字
 * （按钮文字永远比图标可读），其余收进下拉——行内只占两个控件的位置。
 *
 * 演示期约束：所有动作都是写意图，全部 disabled 且可访问名/悬停提示写明原因；
 * 「···」触发器本身不是写操作（只是开菜单），保持可用——点了有真实反馈
 * （展开菜单、看到各项与不可用原因），不是死按钮。
 */
export interface RowAction {
  key: string;
  /** 动作名，直接展示给用户 */
  label: string;
  disabled?: boolean;
  /** 不可用原因，写进悬停提示 */
  reason?: string;
  /** 覆盖可访问名：表格行里带上记录名（如「编辑 AI 商品图生成（暂不可用）」），读屏才有上下文 */
  ariaLabel?: string;
}

export default function RowActions({ actions }: { actions: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const [primary, ...rest] = actions;

  const menuProps: MenuProps = {
    items: rest.map((action) => ({
      key: action.key,
      disabled: action.disabled,
      // 原因放进 label 的原生 title：rc-menu 的 items 不透传 title 到 li 上
      label: <span title={action.reason ?? undefined}>{action.label}</span>,
    })),
  };

  return (
    <span className="ui-actions">
      <Button
        size="small"
        type="text"
        disabled={primary.disabled}
        aria-label={primary.ariaLabel ?? (primary.reason ? primary.label + '（' + primary.reason + '）' : primary.label)}
      >
        {primary.label}
      </Button>
      {rest.length > 0 ? (
        <Dropdown menu={menuProps} trigger={['click']} open={open} onOpenChange={setOpen}>
          <Button size="small" type="text" aria-label="更多操作" icon={<MoreOutlined />} />
        </Dropdown>
      ) : null}
    </span>
  );
}
