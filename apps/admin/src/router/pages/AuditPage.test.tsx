// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AuditPage from './AuditPage';

/**
 * 操作日志页测试（批次 U）：vi.mock api 模块，锁——列表渲染（记录数、时间
 * 格式、缺省兜底）、范围筛选走接口参数（仅门户传 type、全部不传）、关键词
 * 前端二次过滤、错误态重试。分页与列宽是展示层事实，不锁样式。
 */

const fetchOperateLogs = vi.fn();

vi.mock('../../api/yudao', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/yudao')>();
  return {
    ...actual,
    fetchOperateLogs: (...args: unknown[]) => fetchOperateLogs(...args),
  };
});

const LOGS = [
  {
    id: 301,
    type: '门户公告',
    subType: '创建',
    action: '创建了公告「九月发布计划」',
    userName: '林蔚',
    userIp: '192.168.1.9',
    createTime: 1780000000000,
  },
  {
    id: 302,
    type: 'CRM 商机',
    subType: '更新',
    action: '更新了商机「华联年度框架」',
    userName: '王砚',
    userIp: '10.0.0.4',
    createTime: 1780086400000,
  },
  {
    id: 303,
    type: '门户应用',
    subType: '更新',
    action: '更新了应用「AI 图像工坊」',
    userName: '',
    userIp: '',
    createTime: 1780172800000,
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  fetchOperateLogs.mockReset();
});

afterEach(cleanup);

describe('操作日志页（批次 U）', () => {
  it('列表渲染：记录数上屏，时间格式化，操作人与 IP 缺省兜底为 —', async () => {
    fetchOperateLogs.mockResolvedValue(LOGS);
    renderPage();

    expect(await screen.findByText('3 条记录')).toBeTruthy();
    expect(screen.getByText('创建了公告「九月发布计划」')).toBeTruthy();
    expect(screen.getByText('CRM 商机')).toBeTruthy();
    // 时间列是 yyyy-MM-dd HH:mm 形状（时区随环境，不锁具体日期）
    expect(document.body.textContent).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    // 第三行操作人与 IP 双缺省：两处「—」兜底
    expect(screen.getAllByText('—').length).toBe(2);
    expect(fetchOperateLogs).toHaveBeenCalledWith(undefined);
  });

  it('范围筛选走接口参数：仅门户传 type=门户，切回全部不传', async () => {
    // stub 按参数过滤（模拟服务端模拟匹配）：筛选是否真的走接口由此锁定
    fetchOperateLogs.mockImplementation(async (type?: string) =>
      type ? LOGS.filter((item) => item.type.startsWith(type)) : LOGS,
    );
    renderPage();
    await screen.findByText('3 条记录');

    fireEvent.click(screen.getByText('仅门户'));
    await screen.findByText('2 条记录');
    expect(screen.queryByText('CRM 商机')).toBeNull();

    fireEvent.click(screen.getByText('全部模块'));
    await screen.findByText('3 条记录');
  });

  it('关键词在前端二次过滤：收窄记录数，空结果给人话空态', async () => {
    fetchOperateLogs.mockResolvedValue(LOGS);
    renderPage();
    await screen.findByText('3 条记录');

    fireEvent.change(screen.getByPlaceholderText('搜索操作描述或操作人'), {
      target: { value: '图像工坊' },
    });
    expect(screen.getByText('1 条记录')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('搜索操作描述或操作人'), {
      target: { value: '不存在的关键词' },
    });
    expect(screen.getByText('0 条记录')).toBeTruthy();
    expect(screen.getByText('还没有操作记录。')).toBeTruthy();
  });

  it('加载失败：错误态给重试，重试重新拉取', async () => {
    fetchOperateLogs.mockRejectedValueOnce(new Error('网络抖了'));
    renderPage();

    expect(await screen.findByRole('alert')).toBeTruthy();
    fetchOperateLogs.mockResolvedValue(LOGS);
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(await screen.findByText('3 条记录')).toBeTruthy();
    expect(fetchOperateLogs).toHaveBeenCalledTimes(2);
  });
});
