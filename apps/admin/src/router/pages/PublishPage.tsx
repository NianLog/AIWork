import { useNavigate } from 'react-router-dom';
import { Button, Card, Input, InputNumber, Radio, Select, Steps } from 'dingtalk-design-desktop';
import { AddOutlined, CheckOutlined } from 'dd-icons';
import { DEMO_ORGANIZATIONS } from '../../store/demoDirectory';

/**
 * 应用发布：业务团队自助提交新应用的入口。
 *
 * 整张表单以示例内容呈现且全部禁用——发布链路还没有后台服务，
 * 让人在这里填完一整页再告诉他保存不了，比一开始就说明不可用更糟。
 * 提交与检查按钮同样禁用，表单提交不产生任何跳转。
 */

const TEAM_OPTIONS = DEMO_ORGANIZATIONS.filter((org) => org.type !== '临时').map((org) => ({
  value: org.name,
  label: org.name,
}));

const CATEGORY_OPTIONS = [
  { value: 'image', label: '图像生成' },
  { value: 'video', label: '视频生成' },
  { value: 'review', label: '内容审核' },
  { value: 'asset', label: '素材管理' },
  { value: 'insight', label: '数据分析' },
];

const SCOPE_OPTIONS = [
  { value: 'all', label: '全员可见' },
  { value: 'org', label: '指定组织可见' },
  { value: 'role', label: '指定角色可见' },
];

const SAMPLE_FUNCTIONS = [
  { name: '创建生图任务', desc: '选择商品图与风格模板，提交生成' },
  { name: '导出成品图', desc: '把生成结果下载或推送到素材库' },
];

const PUBLISH_STEPS = [
  { title: '提交应用信息', description: '填写名称、介绍与这个应用能做的事' },
  { title: '审核与检查', description: '平台确认内容与可见范围是否合适' },
  { title: '发布上线', description: '通过后出现在应用市场，成员即可使用' },
];

const RELEASE_MODES = [
  { title: '试运行', desc: '先开放给一小部分成员使用，确认没有问题再逐步放开，出问题也只影响这一小部分人。' },
  { title: '正式发布', desc: '一次性开放给可见范围内的全部成员，适合已经在其他渠道验证过的应用。' },
  { title: '停用', desc: '应用从应用市场下架，已经在使用的人会看到「已停用」提示，不会再有新成员进入。' },
];

export default function PublishPage() {
  const navigate = useNavigate();

  return (
    <>
      <div className="admin-pagehead">
        <div className="admin-pagehead__row">
          <div>
            <h1 className="admin-pagehead__title">应用发布</h1>
            <p className="admin-pagehead__lead">
              填写应用的基本信息并提交，审核通过后就会出现在应用市场。下面是一页填写示例。
            </p>
          </div>
          <div className="admin-pagehead__actions">
            <Button onClick={() => navigate('/preview/apps')}>返回应用列表</Button>
          </div>
        </div>
      </div>

      <div className="admin-publish-layout">
        <Card title="应用信息">
          <form aria-label="应用发布" onSubmit={(event) => event.preventDefault()}>
            <div className="admin-form-grid">
              <label className="admin-field">
                <span className="admin-field__label">应用名称</span>
                <Input value="AI 商品图生成" disabled />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">版本号</span>
                <Input value="1.4.0" disabled />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">负责团队</span>
                <Select value="视觉算法组" options={TEAM_OPTIONS} disabled />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">功能分类</span>
                <Select value="image" options={CATEGORY_OPTIONS} disabled />
              </label>

              <label className="admin-field admin-field--full">
                <span className="admin-field__label">应用介绍</span>
                <Input.TextArea
                  rows={3}
                  value="上传商品图，选择风格模板，几分钟后拿到可以直接投放的成品图。适合需要批量出图的运营团队。"
                  disabled
                />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">可见范围</span>
                <Select value="org" options={SCOPE_OPTIONS} disabled />
              </label>

              <label className="admin-field">
                <span className="admin-field__label">试运行比例</span>
                <InputNumber value={20} min={1} max={100} addonAfter="%" disabled />
              </label>

              <div className="admin-field admin-field--full">
                <span className="admin-field__label">发布方式</span>
                <Radio.Group value="canary" disabled>
                  <Radio value="canary">试运行（先给一小部分人用）</Radio>
                  <Radio value="stable">正式发布（可见范围内全部开放）</Radio>
                </Radio.Group>
              </div>

              <div className="admin-field admin-field--full">
                <span className="admin-field__label">
                  这个应用能做什么
                  <span>成员看到的可用功能清单</span>
                </span>
                <div className="admin-func-editor">
                  {SAMPLE_FUNCTIONS.map((item) => (
                    <div className="admin-func-row" key={item.name}>
                      <Input value={item.name} disabled />
                      <Input value={item.desc} disabled />
                    </div>
                  ))}
                  <Button icon={<AddOutlined />} disabled>
                    添加功能（暂不可用）
                  </Button>
                </div>
              </div>
            </div>

            <div className="admin-form-actions">
              <Button type="primary" htmlType="submit" disabled>
                提交上架（暂不可用）
              </Button>
              <Button icon={<CheckOutlined />} disabled>
                检查内容（暂不可用）
              </Button>
              <p className="admin-form-actions__note">
                发布功能还没开通，填写、检查与提交暂时都不可用；页面里的内容只是示例。
              </p>
            </div>
          </form>
        </Card>

        <div className="admin-publish-side">
          <Card title="发布流程">
            <Steps className="admin-steps" direction="vertical" size="small" current={0} items={PUBLISH_STEPS} />
          </Card>

          <Card title="发布方式说明">
            <ul className="admin-explain">
              {RELEASE_MODES.map((mode) => (
                <li key={mode.title}>
                  <strong>{mode.title}</strong>
                  {mode.desc}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
