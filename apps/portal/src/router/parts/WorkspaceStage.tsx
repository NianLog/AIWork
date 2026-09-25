import { Link } from 'react-router-dom';
import { RefreshOutlined } from 'dd-icons';
import { Button } from 'dingtalk-design-mobile';
import type { DemoApp } from '../../store/demoCatalog';

/**
 * 子应用工作区的四态舞台（2026-09-25 批次三契约，接 iframe 前立契）。
 *
 * 状态机只有四态，每一态都有明确的出口或反馈：
 *   loading      加载超时前的过渡反馈（彩虹规范的首秀场景：七段彩虹条 + 品牌淡染骨架）
 *   error        失败四要素：错误码 + 发生了什么 + 建议 + 「重试 / 返回工作台」双出口
 *   ready        子应用挂载位。sandbox / allow 策略由 P0-4 容器层按清单字段定稿
 *   not-integrated 演示期常态：entry 是保留域，不发起任何请求
 *
 * 演示数据永远落在 not-integrated；loading / error 今天没有真实触发路径，
 * 由测试直接喂对应状态覆盖（不造假的加载延迟——假装在加载比没有加载更糟）。
 * P0-4 接入时把本组件的 status 来源换成真实加载器，四态视图不再改。
 */

export type WorkspaceStatus = 'loading' | 'error' | 'ready' | 'not-integrated';

export default function WorkspaceStage({
  status,
  app,
  errorCode,
  errorText,
  onRetry,
  onExit,
}: {
  status: WorkspaceStatus;
  app: DemoApp;
  /** 错误码：给能看日志的人对照用，不承担用户理解职责 */
  errorCode?: string;
  /** 失败原因的人话描述，按「无法完成 X + 下一步」模板写 */
  errorText?: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  if (status === 'loading') {
    return (
      <div className="workspace__loading" role="status" aria-live="polite" aria-label="正在打开应用">
        <div className="workspace__loading-head">
          <span className="ui-rainbow-bar" aria-hidden="true">
            <span /><span /><span /><span /><span /><span /><span />
          </span>
          <p className="workspace__loading-note">正在打开 {app.name}…</p>
        </div>
        <div className="workspace__loading-body">
          <span className="ui-skeleton ui-skeleton--brand ui-skeleton--line-lg workspace__loading-bar" />
          <span className="ui-skeleton ui-skeleton--brand ui-skeleton--block" />
          <span className="ui-skeleton ui-skeleton--brand ui-skeleton--block" />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="ui-errorstate" role="alert">
        {errorCode ? <p className="ui-errorstate__code ui-num">{errorCode}</p> : null}
        <h2 className="ui-errorstate__title">无法打开 {app.name}</h2>
        <p className="ui-errorstate__desc">
          {errorText ?? '应用暂时没有响应，稍后重试一般就能恢复。'}
        </p>
        <div className="ui-errorstate__actions">
          <Button size="large" inline={false} onClick={onRetry}>
            重试
          </Button>
          <Button size="large" inline={false} onClick={onExit}>
            返回工作台
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'ready') {
    return (
      <iframe
        className="workspace__frame"
        src={app.entry}
        title={app.name}
        /*
         * sandbox / allow 属性刻意不在这里写死：它属于 P0-4 容器策略
         * （清单里有 sandbox 字段），提前猜一个只会变成错误的既成事实。
         */
      />
    );
  }

  return (
    <div className="workspace__placeholder" role="note" aria-label="应用加载说明">
      <span className="workspace__placeholder-icon" aria-hidden="true">
        <RefreshOutlined />
      </span>
      {/* 七彩短条是「空态点缀」装饰位（彩虹规范允许的位置），纯装饰 */} 
      <span className="ui-rainbow-bar workspace__placeholder-rainbow" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span />
      </span>
      <p className="workspace__placeholder-title">{app.name}还没有接入这里</p>
      <p className="workspace__placeholder-desc">
        应用容器接通后，这个页面就是它的完整工作区：门户的导航与说明都会让开，
        只保留左上角的返回入口。
      </p>
      <Link className="workspace__placeholder-action" to="/preview">
        返回工作台
      </Link>
    </div>
  );
}
