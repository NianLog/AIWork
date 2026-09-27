import { useId } from 'react';
import { SegmentedControl } from 'dingtalk-design-desktop';

export interface SegmentedFieldOption<T extends string | number = string> {
  label: string;
  value: T;
}

interface SegmentedFieldProps<T extends string | number> {
  /** 读屏播报的用途说明，挂在 group 容器上 */
  label: string;
  options: SegmentedFieldOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * dtd desktop 的 SegmentedControl 把每个选项渲染成纯 span（无 role、无
 * tabIndex、无键盘处理），键盘与读屏用户无法操作筛选。本组件视觉层原样
 * 保留 dtd 控件（包进 aria-hidden 容器对读屏隐藏，避免双播报），语义层
 * 叠加一组视觉隐藏的原生 radio（ui-visually-hidden）：Tab、左右箭头切换、
 * 读屏逐项播报全部回到浏览器原生行为。
 * ponytail: upstream 缺陷的本地替身，升级路径=组件库修复键盘语义后删本
 * 文件换回直用 SegmentedControl。
 */
export default function SegmentedField<T extends string | number>({ label, options, value, onChange }: SegmentedFieldProps<T>) {
  const groupName = useId();
  return (
    <div className="ui-segments" role="group" aria-label={label}>
      {options.map((option) => (
        <input
          key={option.value}
          type="radio"
          className="ui-visually-hidden"
          aria-label={option.label}
          name={groupName}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
        />
      ))}
      <div aria-hidden="true">
        <SegmentedControl
          texts={options.map((option) => option.label)}
          activeIndex={Math.max(0, options.findIndex((option) => option.value === value))}
          onChange={(index) => onChange(options[index].value)}
        />
      </div>
    </div>
  );
}
