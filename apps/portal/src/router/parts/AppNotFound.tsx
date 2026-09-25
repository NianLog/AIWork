import { Link } from 'react-router-dom';
import { DEMO_DISCLOSURE, DEMO_EXPLANATION } from '../../store/demoCatalog';

/**
 * 应用不存在时的兜底：/apps/:appId 里 appId 不在演示目录中。
 *
 * 与全站 404 分开是有意的。全站 404 面对的是「路径打错了」，出口是工作台与登录页；
 * 这里面对的是「应用地址失效了」，出口只有工作台——这时候再给一个登录入口是噪音。
 *
 * h1 由本组件自己出，保证每页恰好一个 h1。
 * 出口用 Link（站内相对地址）而不是 <a href>：全站不允许出现可被浏览器当作外部地址
 * 打开的超链接，测试会扫描 a[href] 断言这一点。
 */
export default function AppNotFound() {
  return (
    <div className="workspace workspace--missing">
      <div className="ui-fallback">
        <p className="ui-fallback__code">找不到</p>
        <h1 className="ui-fallback__title">这个应用不存在</h1>
        <p className="ui-fallback__desc">
          地址里的应用编号不在当前应用清单里。可能是链接过期，或者应用已经下线。
        </p>

        <p className="ui-fallback__actions">
          <Link className="workspace__cta" to="/preview">
            返回工作台
          </Link>
        </p>

        <p className="ui-fallback__note" role="note" aria-label="体验说明">
          {DEMO_DISCLOSURE} · {DEMO_EXPLANATION}
        </p>
      </div>
    </div>
  );
}