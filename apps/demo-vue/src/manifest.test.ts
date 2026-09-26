import { describe, expect, it } from 'vitest';
import manifest from '../micro-app.config.json';
import type { MicroAppManifest } from '@ai-portal/shared-types';

/**
 * micro-app.config.json 是清单唯一事实源（§6.1 schema）：应用内 bootstrap、
 * 后台注册、权限码播种都以它为准。这里锁住它对 MicroAppManifest 契约的符合性
 * 与后台 AppSaveReqVO 的硬约束（framework/sandbox 枚举、appId 命名模式）。
 */
const typed = manifest as MicroAppManifest;

describe('micro-app.config.json 契约', () => {
  it('满足 MicroAppManifest 必填字段与后台枚举约束', () => {
    expect(typed.appId).toMatch(/^[a-z0-9][a-z0-9-]{1,62}$/);
    expect(typed.framework).toBe('vue3');
    expect(typed.sandbox).toBe('iframe');
    expect(typed.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typed.baseRoute.startsWith('/')).toBe(true);
    expect(typed.backendApi).toBeTruthy();
    expect(typed.permissions.length).toBeGreaterThan(0);
  });

  it('权限码全部遵守 appId:resource:action 且归属本应用', () => {
    for (const permission of typed.permissions) {
      expect(permission.code).toMatch(
        new RegExp(`^${typed.appId}:[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$`),
      );
      expect(permission.name).toBeTruthy();
      expect(permission.module).toBeTruthy();
    }
  });
});
