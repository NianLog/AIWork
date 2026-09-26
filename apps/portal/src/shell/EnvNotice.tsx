import { NoticeBar } from 'dingtalk-design-mobile';
import { PORTAL_ENV_LABEL, PORTAL_SOURCE_LABEL } from '../store/portalNotice';

/**
 * 统一环境提示条（原 DemoNotice，批次 C 更名换义）。
 *
 * 提示条是安全语义的承载点，不是装饰：界面必须持续声明当前是联调环境，
 * 避免把联调数据误当成生产平台。测试按 role="note" 与常量断言它始终存在。
 * 页面里需要补充说明时用 .ui-note 另起一段，不要改动这里的文字来源。
 */
export default function EnvNotice() {
  return (
    <div className="portal-notice" role="note" aria-label="环境说明">
      <NoticeBar text={`${PORTAL_ENV_LABEL} · ${PORTAL_SOURCE_LABEL}`} />
    </div>
  );
}
