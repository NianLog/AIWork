import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TaskBoard from './components/TaskBoard.vue';
import { ApiError, createTask, deleteTask, listTasks, whoami } from './api/tasks';
import type { PortalHandle } from '@ai-portal/shared-sdk';

/**
 * 批次 E：任务走真实网关 API（这里 mock api 层），权限门控与
 * 网关身份腿的行为断言。SDK 原语按 can 结果分用例注入。
 */
vi.mock('./api/tasks', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: number | null,
      message: string,
    ) {
      super(message);
    }
  },
  listTasks: vi.fn(),
  createTask: vi.fn(),
  deleteTask: vi.fn(),
  whoami: vi.fn(),
}));

const mocked = { listTasks: vi.mocked(listTasks), createTask: vi.mocked(createTask), deleteTask: vi.mocked(deleteTask), whoami: vi.mocked(whoami) };

function makeHandle(granted: boolean) {
  const emit = vi.fn();
  const handle = {
    mode: 'hosted',
    sdk: {
      auth: { getToken: vi.fn().mockResolvedValue('x'.repeat(32)) },
      permission: { can: vi.fn().mockReturnValue(granted) },
      event: { emit },
      navigate: vi.fn(),
      invoke: vi.fn().mockRejectedValue(new Error('独立模式不支持宿主 JSAPI 调用')),
    },
    props: { user: { nickname: '联调管理员' } },
  } as unknown as PortalHandle & { sdk: { event: { emit: typeof emit } } };
  return { handle, emit };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listTasks.mockResolvedValue([
    { id: 1, title: '存量任务', creatorUserId: 1, createTime: '2026-09-26T12:00:00' },
  ]);
});

describe('TaskBoard（批次 E：真实 API + 权限门控）', () => {
  it('已授予：加载列表，提交新建走 API 并广播带前缀事件，删除可用', async () => {
    mocked.createTask.mockResolvedValue({ id: 4, title: '新任务', creatorUserId: 1, createTime: '2026-09-26T12:01:00' });
    const { handle, emit } = makeHandle(true);
    const wrapper = mount(TaskBoard, { props: { handle } });
    await flushPromises();

    expect(mocked.listTasks).toHaveBeenCalledWith('x'.repeat(32));
    expect(wrapper.text()).toContain('存量任务');

    await wrapper.find('input[aria-label="新任务标题"]').setValue('新任务');
    await wrapper.find('form.board__add').trigger('submit.prevent');
    await flushPromises();

    expect(mocked.createTask).toHaveBeenCalledWith('x'.repeat(32), '新任务');
    expect(wrapper.text()).toContain('新任务');
    expect(wrapper.text()).toContain('#4 · 由用户 1 创建');
    expect(emit).toHaveBeenCalledWith('demo-vue:task:created', { id: 4, title: '新任务' });
    expect((wrapper.findAll('button').find((b) => b.text() === '删除')?.attributes('disabled') ?? undefined)).toBeUndefined();
  });

  it('未授予：输入与按钮禁用并给出原因，API 不被调用', async () => {
    const { handle } = makeHandle(false);
    const wrapper = mount(TaskBoard, { props: { handle } });
    await flushPromises();

    expect(wrapper.find('input[aria-label="新任务标题"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('未授予 demo-vue:task:create，无法新建');
    expect(mocked.createTask).not.toHaveBeenCalled();
    expect(wrapper.find('.board__deny').text()).toContain('demo-vue:task:create');
  });

  it('网关身份腿：whoami 回显 X-User-Id 与本应用权限码', async () => {
    mocked.whoami.mockResolvedValue({
      userId: '7',
      appId: 'demo-vue',
      tenantId: '1',
      orgId: '100',
      roles: ['super_admin'],
      permissions: ['demo-vue:task:create'],
      requestId: 'req-abcdef123456',
    });
    const { handle } = makeHandle(true);
    const wrapper = mount(TaskBoard, { props: { handle } });
    await flushPromises();

    await wrapper.findAll('button').find((b) => b.text() === '网关身份')!.trigger('click');
    await flushPromises();

    expect(mocked.whoami).toHaveBeenCalledWith('x'.repeat(32));
    expect(wrapper.text()).toContain('X-User-Id=7');
    expect(wrapper.text()).toContain('demo-vue:task:create');
  });

  it('批次 F：在途令牌被作废（401）后重取令牌重试一次成功', async () => {
    mocked.whoami
      .mockRejectedValueOnce(new ApiError(401, 401, '登录状态已过期，请重新登录。'))
      .mockResolvedValue({
        userId: '7',
        appId: 'demo-vue',
        tenantId: '1',
        orgId: '100',
        roles: ['super_admin'],
        permissions: ['demo-vue:task:create'],
        requestId: 'req-abcdef123456',
      });
    const { handle } = makeHandle(true);
    const getToken = handle.sdk.auth.getToken as ReturnType<typeof vi.fn>;
    getToken.mockReset().mockImplementation(async () => `token-${getToken.mock.calls.length}`);
    const wrapper = mount(TaskBoard, { props: { handle } });
    await flushPromises();

    await wrapper.findAll('button').find((b) => b.text() === '网关身份')!.trigger('click');
    await flushPromises();

    // 401 后重取了新令牌（两次 whoami 用的令牌不同），重试成功
    const tokens = mocked.whoami.mock.calls.map(([token]) => token);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).not.toBe(tokens[1]);
    expect(wrapper.text()).toContain('X-User-Id=7');
  });
});
