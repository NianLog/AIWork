import { useState } from 'react';
import { Button } from 'dingtalk-design-mobile';
import { CloseOutlined } from 'dd-icons';
import { submitFeedback } from '../../api/yudao';
import type { FeedbackType } from '../../api/yudao';
import Overlay from './Overlay';

/**
 * 反馈弹层（批次 Q）：工作台的「产品反馈」入口，提交到 /portal-feedback/submit。
 *
 * 原生 input/textarea 而不是 dtm 表单控件：dtm Input 不透传 aria-* 到原生
 * 元素（属性白名单，LoginPage 注释实证），反馈表单的字段名靠 label 关联
 * 读屏，原生控件一步到位。错误就地显示在提交按钮上方，不用 toast——
 * 用户打完字不该被一段会消失的文案打发。
 */

const FEEDBACK_TYPES: Array<{ value: FeedbackType; label: string }> = [
  { value: 'suggestion', label: '功能建议' },
  { value: 'bug', label: '问题反馈' },
  { value: 'other', label: '其他' },
];

const EMPTY = { type: 'suggestion' as FeedbackType, content: '', contact: '' };

export default function FeedbackDrawer({
  appId,
  onClose,
}: {
  /** 携带即关联到具体应用（应用抽屉等场景）；工作台入口不传。 */
  appId?: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // dtm Button 的 disabled 只落 aria-disabled，不拦原生点击——防双提交自己守。
    if (busy) return;
    if (!form.content.trim()) {
      setError('先写几句想说的内容。');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitFeedback({
        appId,
        type: form.type,
        content: form.content.trim(),
        contact: form.contact.trim() || undefined,
      });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交没有成功，请稍后再试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay label="产品反馈" onClose={onClose}>
      <header className="overlay__head">
        <div className="overlay__ident-text">
          <h2 className="overlay__title">产品反馈</h2>
          <p className="overlay__subtitle">一句话也好，我们每条都看。</p>
        </div>
        <button type="button" className="overlay__close" onClick={onClose} aria-label="关闭">
          <CloseOutlined aria-hidden="true" />
        </button>
      </header>

      {done ? (
        <div className="overlay__body fb-done">
          <p className="fb-done__title">已收到，谢谢！</p>
          <p className="ui-note">反馈已进入后台待处理列表，留了联系方式的话会尽快回访。</p>
          <Button type="primary" size="large" inline={false} onClick={onClose}>
            好的
          </Button>
        </div>
      ) : (
        <form className="overlay__body fb-form" onSubmit={(event) => void handleSubmit(event)}>
          <fieldset className="fb-form__group">
            <legend className="fb-form__label">反馈类型</legend>
            <div className="fb-form__types" role="radiogroup" aria-label="反馈类型">
              {FEEDBACK_TYPES.map((item) => (
                <label key={item.value} className="fb-form__type">
                  <input
                    type="radio"
                    name="feedback-type"
                    value={item.value}
                    checked={form.type === item.value}
                    onChange={() => setForm({ ...form, type: item.value })}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="fb-form__field">
            <span className="fb-form__label">反馈内容</span>
            <textarea
              value={form.content}
              maxLength={2000}
              rows={4}
              required
              placeholder="遇到了什么问题，或希望增加什么功能？"
              onChange={(event) => setForm({ ...form, content: event.target.value })}
            />
          </label>

          <label className="fb-form__field">
            <span className="fb-form__label">
              联系方式
              <span className="fb-form__optional">（选填）</span>
            </span>
            <input
              type="text"
              value={form.contact}
              maxLength={128}
              placeholder="钉钉号或邮箱，方便我们回访"
              onChange={(event) => setForm({ ...form, contact: event.target.value })}
            />
          </label>

          {error ? (
            <p className="fb-form__error" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="primary" size="large" inline={false} disabled={busy} htmlType="submit">
            {busy ? '正在提交…' : '提交反馈'}
          </Button>
        </form>
      )}
    </Overlay>
  );
}
