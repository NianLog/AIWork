import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Empty, SearchBar, SegmentedControl } from 'dingtalk-design-mobile';
import { AppletOutlined } from 'dd-icons';
import { DEMO_APPS_VIEW, filterDemoApps } from '../../store/demoCatalog';
import type { DemoApp } from '../../store/demoCatalog';
import AppDetailDrawer from '../parts/AppDetailDrawer';
import { AppIconTile, AppStatusTag } from '../parts/AppVisuals';

type ChannelFilter = 'all' | DemoApp['channel'];

/** 状态筛选：把发布通道翻译成业务用户习惯的三种说法。 */
const CHANNEL_OPTIONS: Array<{ value: ChannelFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'stable', label: '正式版' },
  { value: 'canary', label: '试运行' },
  { value: 'paused', label: '已停用' },
];

/**
 * 应用市场：检索、筛选并查看全部应用。
 *
 * 四态骨架（2026-09-25 批次二）：页面只认 DEMO_APPS_VIEW 的「status + data + error」
 * 形状。演示数据永远 success；loading / error 分支由测试喂对应形状覆盖，
 * P0-4 接真实注册接口时只换这个来源。
 *
 * 选中态进 URL（批次二）：详情抽屉的开关是 ?app=<appId>——打开推一条历史
 * （浏览器返回键 = 关抽屉），关闭用 replace（关掉之后再按返回不会把抽屉又开回来），
 * 详情地址可以直接深链分享。
 *
 * 版式取舍：结果区是应用卡片网格（不再借组件库 List 再在宽屏「改造成」网格——
 * 覆盖 .dtm-list-body 的底色、关分组分隔线、改 item 形态，组件库一改内部类名就整块崩）。
 * 一份 DOM 在窄屏和宽屏同构，只是列数随容器宽度变。
 *
 * 卡片是 <div role="button"> 而不是 <a>：这里是「打开详情」的意图，不是跳转，
 * 用链接语义会让读屏与「在新标签打开」把它当成地址。
 */
export default function MarketPage() {
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [searchParams, setSearchParams] = useSearchParams();

  const view = DEMO_APPS_VIEW;
  // 检索只服务成功态的列表；loading / error 分支不消费它。
  // P0-4 换真实来源时，这里改成对 view.data 的过滤。
  const visibleApps = useMemo(() => filterDemoApps(keyword, channel), [keyword, channel]);
  const activeIndex = CHANNEL_OPTIONS.findIndex((option) => option.value === channel);
  const isFiltered = keyword.trim().length > 0 || channel !== 'all';

  /** 选中态即 URL：?app=xxx 打开抽屉（推历史），清除参数关闭（replace） */
  const activeAppId = searchParams.get('app');
  const activeApp = activeAppId
    ? view.data.find((app) => app.appId === activeAppId) ?? null
    : null;

  function openDetail(app: DemoApp) {
    setSearchParams({ app: app.appId });
  }

  function closeDetail() {
    setSearchParams({}, { replace: true });
  }

  function resetFilters() {
    setKeyword('');
    setChannel('all');
  }

  return (
    <div className="ui-page portal-page--market">
      <div className="portal-market__bar">
        <div className="portal-market__toolbar">
          <SearchBar
            className="portal-market__search"
            value={keyword}
            placeholder="搜索应用名称、分类或团队"
            onChange={(value) => setKeyword(value)}
            onClear={() => setKeyword('')}
          />
          <div className="ui-segments" role="group" aria-label="按发布状态筛选">
            <SegmentedControl
              texts={CHANNEL_OPTIONS.map((option) => option.label)}
              activeIndex={activeIndex}
              onChange={(index) => setChannel(CHANNEL_OPTIONS[index].value)}
            />
          </div>
        </div>
        {/* aria-live：检索与筛选后的结果数变化必须被读屏播报，检索对视障用户才闭环。
            加载与失败态不播报计数（没有可播报的数）。 */}
        {view.status === 'success' ? (
          <p className="portal-market__count" aria-live="polite">
            {'找到 ' + visibleApps.length + ' 个应用'}
          </p>
        ) : null}
      </div>

      {view.status === 'loading' ? (
        <section className="ui-section" aria-label="应用列表加载中">
          {/* 骨架是装饰（彩虹规范允许的加载位），不进无障碍树 */}
          <ul className="portal-cards" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <li key={index}>
                <div className="portal-cards__skeleton">
                  <div className="portal-cards__skeleton-head">
                    <span className="ui-skeleton ui-skeleton--tile" />
                    <div className="portal-cards__skeleton-lines">
                      <span className="ui-skeleton ui-skeleton--line-lg" />
                      <span className="ui-skeleton ui-skeleton--line portal-cards__skeleton-line" />
                    </div>
                  </div>
                  <span className="ui-skeleton ui-skeleton--line" />
                  <span className="ui-skeleton ui-skeleton--line portal-cards__skeleton-line" />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : view.status === 'error' ? (
        <section className="ui-section" aria-label="应用列表加载失败">
          <div className="ui-card ui-card--center">
            <div className="ui-errorstate" role="alert">
              <h2 className="ui-errorstate__title">无法加载应用列表</h2>
              <p className="ui-errorstate__desc">
                {view.error ?? '网络暂时没有响应，稍后重试一般就能恢复。'}
              </p>
              <div className="ui-errorstate__actions">
                <Button size="large" onClick={() => window.location.reload()}>
                  重试
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : visibleApps.length > 0 ? (
        <section className="ui-section" aria-label="应用列表">
          <ul className="portal-cards">
            {visibleApps.map((app) => (
              <li key={app.appId}>
                <div
                  className="portal-appcard"
                  role="button"
                  tabIndex={0}
                  aria-label={app.name + ' 详情'}
                  onClick={() => openDetail(app)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDetail(app);
                    }
                  }}
                >
                  <div className="portal-appcard__head">
                    <AppIconTile app={app} size="l" />
                    <div className="portal-appcard__ident">
                      <span className="portal-appcard__name">{app.name}</span>
                      <span className="portal-appcard__meta">
                        {app.category} · {app.ownerTeam}
                      </span>
                    </div>
                    <AppStatusTag app={app} />
                  </div>
                  <p className="portal-appcard__summary">{app.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="ui-section" aria-label="无匹配结果">
          <div className="ui-card ui-card--center">
            <Empty
              type="search"
              title="没有找到相关应用"
              inline
              action={{ text: '清除筛选条件', onClick: resetFilters }}
            />
            {isFiltered ? (
              <p className="ui-note">当前筛选条件下没有应用，清除后可以看到全部演示应用。</p>
            ) : null}
          </div>
        </section>
      )}

      <section className="ui-section" aria-label="应用上架">
        <div className="portal-cta">
          <span className="ui-tile ui-tile--m ui-tone-slate" aria-hidden="true">
            <AppletOutlined />
          </span>
          <div className="portal-cta__text">
            <p className="portal-cta__title">想把自己的工具加进来？</p>
            <p className="portal-cta__desc">
              上架通道还没开通。开通后，你可以在这里提交希望加入的新应用，审核通过后出现在应用市场。
            </p>
          </div>
          {/*
            写意图操作：必须保持不可用，并且可访问名里写明原因。
            「能点但保存不了」比「不能点」更容易被误当成真实能力。
          */}
          <Button size="large" disabled>
            申请上架新应用（暂未开放）
          </Button>
        </div>
      </section>

      {activeApp ? <AppDetailDrawer app={activeApp} onClose={closeDetail} /> : null}
    </div>
  );
}
