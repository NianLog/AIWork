import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, Input, Radio, Select, Steps, message } from 'dingtalk-design-desktop';
import { createApplication, updateApplication, uploadPackage } from '../../api/yudao';
import type { ApplicationRow } from '../../api/yudao';

/**
 * 应用发布（批次 H Step 2 真实化）：受控表单直连 portal-app/create；
 * 应用列表的「编辑」带整行记录经 location.state 跳进来，同一张表单走
 * updateApplication（整行展开再覆盖，防字段清空）。刷新丢 state 回新建模式，
 * 是可接受的简化（拒绝为它引入全局 store，见批次 H 笔记 Alternatives 2）。
 *
 * 字段取舍：只保留后端真实存在的字段（演示期的负责团队/功能分类/可见范围/
 * 应用介绍/功能清单编辑器无后端落点，全部删除——「能填但存不了」比没有更糟）。
 * 装载方式固定 iframe（当前唯一在用的方式，值不进界面文案）。
 *
 * 版式沿用批次二：字段栅格与右侧说明栏分开；右侧「发布流程/发布方式说明」
 * 与左侧表单同屏，让第一次发布的人不离开页面就明白两种方式的差别。
 */

const FRAMEWORK_OPTIONS = [
  { value: 'react', label: 'React' },
  { value: 'vue3', label: 'Vue 3' },
];

const PUBLISH_STEPS = [
  { title: '提交应用信息', description: '填写名称、版本与访问地址' },
  { title: '平台登记', description: '系统登记应用与路由信息' },
  { title: '发布上线', description: '出现在应用市场，成员即可使用' },
];

const RELEASE_MODES = [
  {
    title: '试运行',
    desc: '先开放给一小部分成员使用，确认没有问题再逐步放开，出问题也只影响这一小部分人。',
  },
  {
    title: '正式发布',
    desc: '一次性开放给全部成员，适合已经在其他渠道验证过的应用。',
  },
];

interface PublishForm {
  appId: string;
  name: string;
  version: string;
  framework: string;
  entry: string;
  backendApi: string;
  baseRoute: string;
  mode: 'stable' | 'canary';
  canaryVersion: string;
}

/** 必填项：键与提示名，缺哪个就点名哪个。 */
const REQUIRED_FIELDS: Array<{ key: keyof PublishForm; label: string }> = [
  { key: 'appId', label: '应用标识' },
  { key: 'name', label: '应用名称' },
  { key: 'version', label: '版本号' },
  { key: 'entry', label: '访问入口' },
  { key: 'backendApi', label: '后端服务地址' },
  { key: 'baseRoute', label: '路由前缀' },
];

function initialForm(row?: ApplicationRow): PublishForm {
  if (row) {
    return {
      appId: row.appId,
      name: row.name,
      version: row.version,
      framework: row.framework || 'react',
      entry: row.entry,
      backendApi: row.backendApi,
      baseRoute: row.baseRoute,
      mode: row.channel === 'canary' ? 'canary' : 'stable',
      canaryVersion: row.canaryVersion ?? '',
    };
  }
  return {
    appId: '',
    name: '',
    version: '',
    framework: 'react',
    entry: '',
    backendApi: '',
    baseRoute: '',
    mode: 'stable',
    canaryVersion: '',
  };
}

export default function PublishPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editing = (location.state as { app?: ApplicationRow } | null)?.app;
  const [form, setForm] = useState<PublishForm>(() => initialForm(editing));
  const [submitting, setSubmitting] = useState(false);
  const [zipFile, setZipFile] = useState<File | null>(null);
  /** 上传通道（批次 I）：选中 zip 后，版本/入口等字段以包内 manifest 为准，表单隐藏。 */
  const manifestDriven = !editing && zipFile !== null;

  const setField = (key: keyof PublishForm, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const required = zipFile
      ? REQUIRED_FIELDS.filter((field) => field.key === 'appId')
      : REQUIRED_FIELDS;
    const missing = required
      .filter((field) => !String(form[field.key]).trim())
      .map((field) => field.label);
    if (!zipFile && form.mode === 'canary' && !form.canaryVersion.trim()) {
      missing.push('试运行版本');
    }
    if (missing.length > 0) {
      message.warning(`请先填写：${missing.join('、')}。`);
      return;
    }
    setSubmitting(true);
    try {
      if (zipFile) {
        const result = await uploadPackage({
          appId: form.appId.trim(),
          channel: form.mode,
          file: zipFile,
        });
        message.success(
          result.previousVersion
            ? `已发布 ${result.version}（原版本 ${result.previousVersion}）。`
            : `已发布 ${result.version}。`,
        );
      } else if (editing) {
        await updateApplication(editing, {
          name: form.name.trim(),
          version: form.version.trim(),
          framework: form.framework,
          entry: form.entry.trim(),
          backendApi: form.backendApi.trim(),
          baseRoute: form.baseRoute.trim(),
          ...(form.mode === 'canary'
            ? { canaryVersion: form.canaryVersion.trim() }
            : { canaryVersion: '' }),
        });
        message.success('应用信息已保存。');
      } else {
        await createApplication({
          appId: form.appId.trim(),
          name: form.name.trim(),
          version: form.version.trim(),
          framework: form.framework,
          entry: form.entry.trim(),
          backendApi: form.backendApi.trim(),
          baseRoute: form.baseRoute.trim(),
          sandbox: 'iframe',
          ...(form.mode === 'canary' ? { canaryVersion: form.canaryVersion.trim() } : {}),
          status: 0,
        });
        message.success('应用已提交，随后出现在应用市场。');
      }
      navigate('/preview/apps');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '提交没有成功，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ui-page">
      <div className="admin-toolbar-row">
        <p className="ui-pagehead__lead">
          {editing
            ? `正在编辑「${editing.name}」的应用信息，保存后立即生效。`
            : '填写应用的基本信息并提交，新应用提交后立即上架到应用市场，随时可以调整发布通道或下架。'}
        </p>
        <div className="ui-pagehead__actions">
          <Button onClick={() => navigate('/preview/apps')}>返回应用列表</Button>
        </div>
      </div>

      <div className="admin-publish-layout">
        <Card className="ui-card" title={editing ? '编辑应用信息' : '应用信息'}>
          <form aria-label="应用发布" onSubmit={handleSubmit}>
            <div className="ui-form-grid">
              {editing ? null : (
                <label className="ui-field ui-field--full">
                  <span className="ui-field__label">
                    产物包（.zip）
                    <span>可选：上传后名称、版本等发布信息以包内清单文件为准</span>
                  </span>
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(event) => setZipFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              )}

              {manifestDriven ? null : (
                <>
                  <label className="ui-field">
                    <span className="ui-field__label">应用名称</span>
                    <Input
                      value={form.name}
                      onChange={(event) => setField('name', event.target.value)}
                      placeholder="例如：图像工坊"
                    />
                  </label>

                  <label className="ui-field">
                    <span className="ui-field__label">版本号</span>
                    <Input
                      value={form.version}
                      onChange={(event) => setField('version', event.target.value)}
                      placeholder="例如：1.4.0"
                    />
                  </label>
                </>
              )}

              <label className="ui-field">
                <span className="ui-field__label">
                  应用标识
                  <span>{editing ? '标识创建后不可修改' : '英文与小写，创建后不可修改'}</span>
                </span>
                <Input
                  value={form.appId}
                  disabled={Boolean(editing)}
                  onChange={(event) => setField('appId', event.target.value)}
                  placeholder="例如：image-studio"
                />
              </label>

              {manifestDriven ? null : (
                <>
                  <label className="ui-field">
                    <span className="ui-field__label">技术框架</span>
                    <Select
                      value={form.framework}
                      options={FRAMEWORK_OPTIONS}
                      onChange={(value) => setField('framework', value)}
                    />
                  </label>

                  <label className="ui-field">
                    <span className="ui-field__label">访问入口</span>
                    <Input
                      value={form.entry}
                      onChange={(event) => setField('entry', event.target.value)}
                      placeholder="应用页面地址，例如：/subapps/image-studio/"
                    />
                  </label>

                  <label className="ui-field">
                    <span className="ui-field__label">路由前缀</span>
                    <Input
                      value={form.baseRoute}
                      onChange={(event) => setField('baseRoute', event.target.value)}
                      placeholder="例如：/image-studio"
                    />
                  </label>

                  <label className="ui-field ui-field--full">
                    <span className="ui-field__label">后端服务地址</span>
                    <Input
                      value={form.backendApi}
                      onChange={(event) => setField('backendApi', event.target.value)}
                      placeholder="应用调用的服务地址，例如：http://jbslab.bili:48080/admin-api"
                    />
                  </label>
                  <p className="ui-note">
                    成员端不直接访问这个地址：门户把 /api/应用标识/… 自动转发到这里，内网地址无需暴露公网。
                    要填完整前缀（含 /admin-api 这类上下文），转发时把后面的路径原样拼在它后面。
                  </p>
                </>
              )}

              <div className="ui-field ui-field--full">
                <span className="ui-field__label">发布方式</span>
                <Radio.Group
                  value={form.mode}
                  onChange={(event) => setField('mode', event.target.value)}
                >
                  <Radio value="stable">正式发布（全部成员立即可用）</Radio>
                  <Radio value="canary">试运行（先给指定的成员使用）</Radio>
                </Radio.Group>
              </div>

              {form.mode === 'canary' ? (
                <>
                  {manifestDriven ? null : (
                    <label className="ui-field">
                      <span className="ui-field__label">试运行版本</span>
                      <Input
                        value={form.canaryVersion}
                        onChange={(event) => setField('canaryVersion', event.target.value)}
                        placeholder="例如：1.5.0-rc.1"
                      />
                    </label>
                  )}
                  <p className="ui-note">
                    谁可以先看到试运行版，在应用列表的「灰度规则」里按角色、部门或指定成员配置；
                    没配规则时试运行版对所有人不可见。
                  </p>
                </>
              ) : null}
            </div>

            <div className="ui-form-actions">
              <Button type="primary" htmlType="submit" loading={submitting}>
                {editing ? '保存修改' : '提交上架'}
              </Button>
              <p className="ui-form-actions__note">
                提交后立即生效；发布方式、版本与上下架状态之后都能在应用列表里调整。
              </p>
            </div>
          </form>
        </Card>

        <aside className="admin-publish-side" aria-label="发布说明">
          <Card className="ui-card" title="发布流程">
            <Steps
              className="admin-steps"
              direction="vertical"
              size="small"
              current={0}
              items={PUBLISH_STEPS}
            />
          </Card>

          <Card className="ui-card" title="发布方式说明">
            <ul className="admin-explain">
              {RELEASE_MODES.map((mode) => (
                <li className="admin-explain__item" key={mode.title}>
                  <p className="admin-explain__title">{mode.title}</p>
                  <p className="admin-explain__desc">{mode.desc}</p>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
