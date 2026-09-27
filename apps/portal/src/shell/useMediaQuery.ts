import { useEffect, useState } from 'react';

/**
 * 宽屏断点：≥ 1024px 视为电脑版钉钉（PC / 宽窗口）。
 *
 * 断点阶梯定义在 @ai-portal/ui-tokens/tokens.css 的头部注释里。CSS 变量读不进媒体查询，
 * 所以这里必须与那里手写保持同步——改一处就要改两处，这是刻意的（见该文件说明）。
 */
export const WIDE_QUERY = '(min-width: 1024px)';

/**
 * 功能进展页的结构断点：≥ 768px 用横向时间轴看板，< 768px 用纵向折叠清单。
 *
 * 比 WIDE_QUERY 低一档是有意的：这一页的两种结构差别大到不能靠 CSS 挪位置解决，
 * 而平板（768~1023px）横向宽度已经放得下两列轨道，用折叠清单反而浪费。
 * 手机才是真正需要「一次只展开一组」的形态。
 *
 * 两个形态共用同一份数据，但 DOM 结构、信息层次与交互都不同，所以同样走
 * 「按断点换组件」而不是「用 CSS 藏起一份」——被藏起的节点在 jsdom 与部分读屏软件里
 * 依然算数，会让同一个小标题出现两份。
 */
export const PROGRESS_BOARD_QUERY = '(min-width: 768px)';

/**
 * 订阅一条媒体查询。
 *
 * 为什么需要 JS 断点而不是纯 CSS：宽屏要换的是「组件」而不是「样式」——
 * 移动端的 TabBar 是一个底部渐变容器裹着胶囊，横过来放不进顶部导航栏；
 * 用 display:none 藏起其中一份也不行，被藏起的节点在 jsdom 与部分读屏软件里
 * 依然算数，会让「当前导航」出现两份。宁可让组件按断点二选一渲染。
 *
 * 测试环境（jsdom）的 matchMedia 是恒为 false 的桩，因此测试始终走窄屏分支。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const list = window.matchMedia(query);
    const sync = () => {
      setMatches(list.matches);
    };

    sync();
    list.addEventListener('change', sync);

    return () => {
      list.removeEventListener('change', sync);
    };
  }, [query]);

  return matches;
}