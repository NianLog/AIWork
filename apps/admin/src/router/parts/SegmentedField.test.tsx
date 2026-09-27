// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SegmentedField from './SegmentedField';

/**
 * 键盘替身语义锁（PR2 评审修复）：dtd SegmentedControl 的选项是纯 span，
 * 语义与键盘全靠本组件叠加的视觉隐藏 radio 组。锁三件事——选项数与
 * checked 状态同步、radio 可聚焦可点选并回调 value、dtd 视觉层对读屏
 * 隐藏（防双播报）。
 */

const OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '已上线', value: 'stable' },
  { label: '试运行', value: 'canary' },
];

afterEach(cleanup);

describe('SegmentedField 键盘替身（PR2 评审修复）', () => {
  it('每个选项渲染一个原生 radio，当前值对应的 radio 处于 checked', () => {
    render(<SegmentedField label="按发布状态筛选" options={OPTIONS} value="stable" onChange={() => {}} />);
    const radios = screen.getAllByRole<HTMLInputElement>('radio');
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => radio.checked)).toEqual([false, true, false]);
    radios.forEach((radio) => expect(radio.tabIndex).toBe(0));
  });

  it('点选 radio 回调对应 value（左右箭头切换由浏览器原生 radio 组行为保证）', () => {
    const onChange = vi.fn();
    render(<SegmentedField label="按状态筛选" options={OPTIONS} value="all" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: '试运行' }));
    expect(onChange).toHaveBeenCalledWith('canary');
  });

  it('dtd 视觉层包在 aria-hidden 容器里，避免与 radio 语义双播报', () => {
    const { container } = render(<SegmentedField label="筛选" options={OPTIONS} value="all" onChange={() => {}} />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
    expect(hidden?.querySelectorAll('span').length).toBeGreaterThan(0);
  });
});
