import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Empty, SearchBar, SegmentedControl } from 'dingtalk-design-mobile';
import { AppletOutlined } from 'dd-icons';
import { deriveChannel, deriveVisual, useAppRegistryStore } from '../../store/appRegistryStore';
import type { AppChannel } from '../../store/appRegistryStore';
import AppDetailDrawer from '../parts/AppDetailDrawer';
import { AppIconTile, AppStatusTag } from '../parts/AppVisuals';

type ChannelFilter = 'all' | AppChannel;

/**
 * 状态筛选：enabled-list 只返回启用应用，所以没有「已停用」这一档——
 * 停用的应用在管理端可见、在门户不可见，这是接口语义，不是缺档。
 */
const CHANNEL_OPTIONS: Array<{ value: ChannelFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'stable', label: '正式版' },
  { value: 'canary', label: '试运行' },
];

/**
 * 应用市场：检索、筛选并查看全部启用应用（批次 C 起来自注册表接口）。
 *
 * 选中态进 URL（批次二）：详情抽屉的开关是 ?app=<appId>——打开推一条历史
 * （浏览器返回键 = 关抽屉），关闭用 replace，详情地址可以直接深链分享。
 *
 * 版式取舍：结果区是应用卡片网格（不借组件库 List 再「改造成」网格——
 * 覆盖内部类名的改法，组件库一改就整块崩）。一份 DOM 在窄屏和宽屏同构。
 * 卡片是 <div role="button">：这里是「打开详情」的意图，不是跳转，
 * 用链接语义会让读屏与「在新标签打开」把它当成地址。
 */
export default function MarketPage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [channel, setChannel] = useState<ChannelFilter>('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useAppRegistryStore((state) => state.view);
  const needsLogin = useAppRegistryStore((state) => state.needsLogin);

  useEffect(() => {
    void useAppRegistryStore.getState().fetch();
  }, []);

  const visibleApps = useMemo(() => {
    if (view.status !== 'success') return [];
    const normalized = keyword.trim().toLowerCase();
    return view.data.filter((app) => {
      if (channel !== 'all' && deriveChannel(app) !== channel) return false;
      if (!normalized) return true;
      const haystack = [app.name, app.appId, app.version].join(' ').toLowerCase();
      return haystack.includes(normalized);
    });
  }, [view, keyword, channel]);

  const activeIndex = CHANNEL_OPTIONS.findIndex((option) => option.value === channel);
  const isFiltered = keyword.trim().length > 0 || channel !== 'all';

  const activeAppId = searchParams.get('app');
  const activeApp = activeAppId
    ? view.data.find((app) => app.appId === activeAppId) ?? null
    : null;

  function openDetail(appId: string) {
    setSearchParams({ app: appId });
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
            placeholder="搜索应用名称或标识"
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
        {/* aria-live：检索与筛选后的结果数变化必须被读屏播报（仅成功态有数可播）。 */}
        {view.status === 'success' ? (
          <p className="portal-market__count" aria-live="polite">
            {'找到 ' + visibleApps.length + ' 个应用'}
          </p>
        ) : null}
      </div>

      {needsLogin ? (
        <section className="ui-section" aria-label="需要登录">
          <div className="ui-card ui-card--center">
            <Empty title="登录后查看应用" inline />
            <p className="ui-note">应用清单需要登录后获取。</p>
            <Button size="large" inline={false} onClick={() => navigate('/login')}>
              去登录
            </Button>
          </div>
        </section>
      ) : view.status === 'loading' ? (
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
                <Button size="large" onClick={() => void useAppRegistryStore.getState().fetch()}>
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
                  onClick={() => openDetail(app.appId)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDetail(app.appId);
                    }
                  }}
                >
                  <div className="portal-appcard__head">
                    <AppIconTile visual={deriveVisual(app.appId)} size="l" />
                    <div className="portal-appcard__ident">
                      <span className="portal-appcard__name">{app.name}</span>
                      <span className="portal-appcard__meta">版本 v{app.version}</span>
                    </div>
                    <AppStatusTag channel={deriveChannel(app)} />
                  </div>
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
              <p className="ui-note">当前筛选条件下没有应用，清除后可以看到全部应用。</p>
            ) : (
              <p className="ui-note">应用在管理端配置并启用后，会自动出现在这里。</p>
            )}
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
