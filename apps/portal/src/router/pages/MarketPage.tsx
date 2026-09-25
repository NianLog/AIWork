import { useMemo, useState } from 'react';
import { Button, Empty, SearchBar, SegmentedControl } from 'dingtalk-design-mobile';
import { AppletOutlined } from 'dd-icons';
import { DEMO_APPS, filterDemoApps } from '../../store/demoCatalog';
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
 * 检索与筛选只作用在演示目录上，用于验证交互形态；点开卡片展示详情抽屉，
 * 不产生任何指向子应用的跳转。界面只呈现业务字段，不展示应用标识、技术框架、
 * 运行指标等实现细节。
 *
 * 版式取舍：结果区不再借用组件库 List 再在宽屏把它「改造成」卡片网格
 * （过去要覆盖 .dtm-list-body 的底色、关掉分组分隔线、再把每个 item 变卡片，
 * 一旦组件库改了内部类名就整块崩掉）。这里直接用应用卡片网格，一份 DOM
 * 在窄屏和宽屏都是同一套结构，只是列数随容器宽度变。
 *
 * 卡片是 <div role="button"> 而不是 <a>：这里是「打开详情」的意图，不是跳转，
 * 用链接语义会让读屏与「在新标签打开」把它当成地址。
 */
export default function MarketPage() {
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [activeApp, setActiveApp] = useState<DemoApp | null>(null);

  const visibleApps = useMemo(() => filterDemoApps(keyword, channel), [keyword, channel]);
  const activeIndex = CHANNEL_OPTIONS.findIndex((option) => option.value === channel);
  const isFiltered = keyword.trim().length > 0 || channel !== 'all';

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
        <p className="portal-market__count">{`找到 ${visibleApps.length} 个应用`}</p>
      </div>

      {visibleApps.length > 0 ? (
        <section className="ui-section" aria-label="应用列表">
          <ul className="portal-cards">
            {visibleApps.map((app) => (
              <li key={app.appId}>
                <div
                  className="portal-appcard"
                  role="button"
                  tabIndex={0}
                  aria-label={`${app.name} 详情`}
                  onClick={() => setActiveApp(app)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setActiveApp(app);
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
              <p className="ui-note">
                当前筛选条件下没有应用，清除后可以看到全部 {DEMO_APPS.length} 个演示应用。
              </p>
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

      {activeApp ? <AppDetailDrawer app={activeApp} onClose={() => setActiveApp(null)} /> : null}
    </div>
  );
}