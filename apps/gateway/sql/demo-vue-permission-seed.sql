-- 权限播种（批次 E / P0-5）：demo-vue 两个权限码进入 Yudao RBAC。
-- 执行方式：宝塔 → Docker → 容器 ai-portal-mysql「终端」，选 ruoyi-vue-pro 库粘贴执行。
-- 幂等：字典表有 uk_app_code 唯一键，菜单表按主键，重复执行不产生脏数据。
--
-- 背景：admin 是 super_admin，权限校验全放行，但 get-permission-info 返回的权限码
-- 列表来自菜单表——播种后 admin 的列表即含 demo-vue: 码，SDK can() 翻真；
-- 未播种/未授予的用户 can() 为假且直调接口 403，两侧状态一致。
-- 菜单 ID 取 50000 段，远离 Yudao 内置数据（AUTO_INCREMENT 当前 12732）。

INSERT IGNORE INTO `system_menu`
  (`id`, `name`, `permission`, `type`, `sort`, `parent_id`, `path`, `icon`,
   `component`, `component_name`, `status`, `visible`, `keep_alive`, `always_show`, `creator`)
VALUES
  (50000, '演示应用（demo-vue）', '', 1, 99, 0, 'demo-vue', 'ep:apple', NULL, NULL, 0, b'1', b'1', b'1', 'seed'),
  (50001, '任务新建', 'demo-vue:task:create', 3, 1, 50000, '', '', NULL, NULL, 0, b'1', b'1', b'1', 'seed'),
  (50002, '任务删除', 'demo-vue:task:delete', 3, 2, 50000, '', '', NULL, NULL, 0, b'1', b'1', b'1', 'seed');

-- 权限码字典（角色编辑页「应用-模块-权限」三级勾选的数据源；P1-5 上传自动入库前的手工播种）
INSERT INTO `sys_app_permission` (`app_id`, `code`, `name`, `description`, `module`, `creator`, `tenant_id`)
VALUES
  ('demo-vue', 'demo-vue:task:create', '新建任务', 'demo-vue 演示应用：新建任务按钮权限', 'task', 'seed', 1),
  ('demo-vue', 'demo-vue:task:delete', '删除任务', 'demo-vue 演示应用：删除任务按钮权限', 'task', 'seed', 1)
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`), `module` = VALUES(`module`);
