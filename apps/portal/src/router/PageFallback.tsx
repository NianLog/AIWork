/**
 * 路由级懒加载骨架（批次 G）：页面 chunk 加载期间的内容区占位。
 *
 * 复用既有骨架类零新 CSS：`workspace__loading-body` 只是纵向 flex 列容器
 * （工作区加载态在用的同一容器），两根 `ui-skeleton--brand` 骨架条是共享层
 * 装饰（aria-hidden，读屏不播报）。刻意不复用 `.workspace__loading` 整套——
 * 那是「正在打开某应用」的子应用语义，带 role=status 播报，用在普通页面切换
 * 会向读屏用户误报加载状态。chunk 是同源内网小文件，占位只存在几十毫秒。
 */
export default function PageFallback() {
  return (
    <div className="workspace__loading-body" aria-hidden="true">
      <span
        className="ui-skeleton ui-skeleton--brand ui-skeleton--line-lg"
        style={{ width: '40%' }}
      />
      <span className="ui-skeleton ui-skeleton--brand ui-skeleton--block" />
    </div>
  );
}
