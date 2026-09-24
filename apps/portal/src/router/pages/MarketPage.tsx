import { useMemo, useState } from 'react';
import { Button, Empty, List, SearchBar, SegmentedControl } from 'dingtalk-design-mobile';
import { filterDemoApps } from '../../store/demoCatalog';
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
 * 检索与筛选只作用在演示目录上，用于验证交互形态；点开列表项展示详情抽屉，
 * 不产生任何指向子应用的跳转。界面只呈现业务字段，不展示应用标识、技术框架、
 * 运行指标等实现细节。
 */
export default function MarketPage() {
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [activeApp, setActiveApp] = useState<DemoApp | null>(null);

  const visibleApps = useMemo(() => filterDemoApps(keyword, channel), [keyword, channel]);
  const activeIndex = CHANNEL_OPTIONS.findIndex((option) => option.value === channel);

  return (
    <>
      <div className="portal-market__toolbar">
        <SearchBar
          value={keyword}
          placeholder="搜索应用名称、分类或团队"
          onChange={(value) => setKeyword(value)}
          onClear={() => setKeyword('')}
        />
        <div className="portal-market__filters" role="group" aria-label="按发布状态筛选">
          <SegmentedControl
            texts={CHANNEL_OPTIONS.map((option) => option.label)}
            activeIndex={activeIndex}
            onChange={(index) => setChannel(CHANNEL_OPTIONS[index].value)}
          />
        </div>
      </div>

      <p className="portal-market__count">找到 {visibleApps.length} 个应用</p>

      {visibleApps.length > 0 ? (
        <section className="portal-section" aria-label="应用列表">
          <List>
            {visibleApps.map((app) => (
              <List.Item
                key={app.appId}
                thumb={<AppIconTile app={app} size="sm" />}
                extra={<AppStatusTag app={app} />}
                brief={`${app.category} · ${app.ownerTeam}`}
                onClick={() => setActiveApp(app)}
              >
                {app.name}
              </List.Item>
            ))}
          </List>
        </section>
      ) : (
        <section className="portal-section" aria-label="无匹配结果">
          <div className="portal-card">
            <Empty
              type="search"
              title="没有找到相关应用"
              inline
              action={{
                text: '清除筛选条件',
                onClick: () => {
                  setKeyword('');
                  setChannel('all');
                },
              }}
            />
          </div>
        </section>
      )}

      <section className="portal-section" aria-label="应用上架">
        <div className="portal-card">
          <Button size="large" inline={false} disabled>
            申请上架新应用（暂未开放）
          </Button>
          <p className="portal-note-text">
            上架通道还没开通。开通后，你可以在这里提交希望加入的新应用。
          </p>
        </div>
      </section>

      {activeApp ? <AppDetailDrawer app={activeApp} onClose={() => setActiveApp(null)} /> : null}
    </>
  );
}