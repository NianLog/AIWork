import { Button } from 'dingtalk-design-mobile';

/**
 * 子应用工作区舞台（三态：loading / error / ready）。
 *
 * 状态机由容器层 AppMount 驱动（批次 C 起是真实加载状态机，不再是演示占位）：
 *   loading   过渡反馈（彩虹规范允许的加载位：七段彩虹条 + 品牌淡染骨架）
 *   error     失败四要素：错误码 + 发生了什么 + 建议 + 「重试 / 返回工作台」双出口
 *   ready     舞台自己不渲染任何东西——子应用挂载位（.workspace__mount）由
 *             AppMount 提供，iframe 适配器把子应用塞进去；此时本组件返回 null。
 */

export type WorkspaceStatus = 'loading' | 'error' | 'ready';

export default function WorkspaceStage({
  status,
  app,
  errorCode,
  errorText,
  onRetry,
  onExit,
}: {
  status: WorkspaceStatus;
  app: { name: string };
  /** 错误码：给能看日志的人对照用，不承担用户理解职责 */
  errorCode?: string;
  /** 失败原因的人话描述，按「无法完成 X + 下一步」模板写 */
  errorText?: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  if (status === 'ready') {
    return null;
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
