import { NoticeBar } from 'dingtalk-design-mobile';
import { DEMO_DISCLOSURE, DEMO_SESSION_LABEL } from '../store/demoCatalog';

/**
 * 统一体验提示条。
 *
 * 提示条是安全语义的承载点，不是装饰：界面必须持续声明「体验示例、无需登录」，
 * 避免把演示界面误当成已开通的真实平台。测试按 role="note" 与 DEMO_DISCLOSURE 断言它始终存在。
 *
 * 之所以收成一个组件：门户有三个页面 + 登录页 + 兜底页，五处都要这条提示。
 * 各写一遍的后果是文案迟早分叉——而这条文案正是测试盯着的那一条。
 * 页面里需要补充说明时，用 .ui-note 另起一段，不要改动这里的文字。
 */
export default function DemoNotice() {
  return (
    <div className="portal-notice" role="note" aria-label="体验说明">
      <NoticeBar text={`${DEMO_DISCLOSURE} · ${DEMO_SESSION_LABEL}`} />
    </div>
  );
}