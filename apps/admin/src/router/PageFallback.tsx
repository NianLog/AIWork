/**
 * 路由级懒加载骨架（批次 G）：页面 chunk 加载期间的内容区占位。
 *
 * admin 侧没有 portal 的 workspace__loading-body 等价容器，自带
 * `.admin-page-fallback`（styles.css 里 3 行纵向 flex）。两根
 * `ui-skeleton--brand` 骨架条是共享层装饰（aria-hidden，读屏不播报）。
 * chunk 是同源内网小文件，占位只存在几十毫秒。
 */
export default function PageFallback() {
  return (
    <div className="admin-page-fallback" aria-hidden="true">
      <span
        className="ui-skeleton ui-skeleton--brand ui-skeleton--line-lg"
        style={{ width: '40%' }}
      />
      <span className="ui-skeleton ui-skeleton--brand ui-skeleton--block" />
    </div>
  );
}
