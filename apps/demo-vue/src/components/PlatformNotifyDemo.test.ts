import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PortalHandle } from '@ai-portal/shared-sdk';
import PlatformNotifyDemo from './PlatformNotifyDemo.vue';

/**
 * 平台通知示例组件测试：只验契约行为——用户态现取 token、成功/失败如实上屏、
 * 非法输入不发请求。真实 API 形状由后端测试与接入规范文档锁定。
 */
vi.mock('../api/portalNotify', () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: number | null,
      message: string,
    ) {
      super(message);
    }
  }
  return { ApiError, sendPlatformNotify: vi.fn() };
});

import { ApiError, sendPlatformNotify } from '../api/portalNotify';

const mockedSend = vi.mocked(sendPlatformNotify);

function makeHandle(): PortalHandle {
  return {
    sdk: { auth: { getToken: vi.fn().mockResolvedValue('tok-1') } },
  } as unknown as PortalHandle;
}

function mounted() {
  return mount(PlatformNotifyDemo, { props: { handle: makeHandle() } });
}

beforeEach(() => {
  mockedSend.mockReset();
});

describe('PlatformNotifyDemo', () => {
  test('成功：现取 SDK token 发送并上屏送达', async () => {
    mockedSend.mockResolvedValueOnce(undefined);
    const wrapper = mounted();
    await wrapper.find('input[aria-label="收件用户编号"]').setValue('7');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(mockedSend).toHaveBeenCalledWith('tok-1', expect.objectContaining({ userId: 7 }));
    expect(wrapper.text()).toContain('已送达平台');
  });

  test('失败：ApiError 的状态与消息如实上屏', async () => {
    mockedSend.mockRejectedValueOnce(new ApiError(403, null, '没有该操作权限'));
    const wrapper = mounted();
    await wrapper.find('input[aria-label="收件用户编号"]').setValue('7');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('HTTP 403');
    expect(wrapper.text()).toContain('没有该操作权限');
  });

  test('非法用户编号：不发请求，提示上屏', async () => {
    const wrapper = mounted();
    await wrapper.find('input[aria-label="收件用户编号"]').setValue('abc');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(mockedSend).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('收件用户编号须为正整数');
  });
});
