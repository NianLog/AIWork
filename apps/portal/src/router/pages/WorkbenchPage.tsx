import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Empty } from 'dingtalk-design-mobile';
import { AnnouncementOutlined, MessageOutlined, RightArrowOutlined } from 'dd-icons';
import { fetchAnnouncements } from '../../api/yudao';
import type { PortalAnnouncement } from '../../api/yudao';
import { summarizeApps, useAppRegistryStore, formatUpdateTime } from '../../store/appRegistryStore';
import { useSessionStore } from '../../store/sessionStore';
import { PORTAL_ENV_LABEL } from '../../store/portalNotice';
import { summarizeRoadmap } from '../../store/roadmap';
import AppDetailDrawer from '../parts/AppDetailDrawer';
import FeedbackDrawer from '../parts/FeedbackDrawer';
import { AppIconTile } from '../parts/AppVisuals';
import { deriveVisual } from '../../store/appRegistryStore';

/**
 * 工作台：门户首屏（2026-09-28 参照 docs/钉钉工作台预览图 重排信息架构）。
 *
 * 构图对齐参考图：灰底上「问候条 + 大白卡（应用条目宫格，瓦片 + 名称横排）」，
 * 右栏白卡放公告、功能进展速览与应用统计——彩色只留在应用图标瓦片上。
 * 应用清单来自注册表接口（批次 C 起），统计数字由清单派生；
 * 应用没有描述字段，条目只放名称，不造假文案。
 *
 * 公告（批次 Q）来自后台公告管理：右栏置顶第一张卡，是运营向用户喊话的通道。
 * 反馈入口在页面最底部一行——PortalShell 刻意无页脚（见其注释），反馈放工作台
 * 页内既不违背那个决策，也是用户最有意见的页面上顺手能找到的位置。
 */

/** 公告是增益内容：拉取失败直接不渲染卡片，不在工作台摆错误剧场。 */
function AnnouncementCard() {
  const [announcements, setAnnouncements] = useState<PortalAnnouncement[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnnouncements()
      .then((list) => {
        if (!cancelled) setAnnouncements(list);
      })
      .catch(() => {
        if (!cancelled) setAnnouncements([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!announcements || announcements.length === 0) return null;

  return (
    <section className="wb-card" aria-label="平台公告">
      <div className="ui-section__head">
        <h2 className="ui-section__title">
          <span className="wb-announce__icon" aria-hidden="true">
            <AnnouncementOutlined />
          </span>
          平台公告
        </h2>
      </div>
      <ul className="wb-announce">
        {announcements.map((item) => (
          <li key={item.id} className="wb-announce__item">
            <p className="wb-announce__title">
              {item.pinned ? <span className="wb-announce__pin">置顶</span> : null}
              {item.title}
            </p>
            <p className="wb-announce__content">{item.content}</p>
            <p className="wb-announce__time ui-num">{formatUpdateTime(item.createTime ?? 0)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function WorkbenchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = useAppRegistryStore((state) => state.view);
  const session = useSessionStore((state) => state.session);
  const roadmap = useMemo(() => summarizeRoadmap(), []);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    void useAppRegistryStore.getState().fetch();
  }, []);

  const stats = useMemo(() => summarizeApps(view.data), [view.data]);
  /** 选中态即 URL：?app=xxx 打开抽屉（推历史），清除参数关闭（replace） */
  const activeAppId = searchParams.get('app');
  const activeApp = activeAppId
    ? view.data.find((app) => app.appId === activeAppId) ?? null
    : null;

  return (
    <div className="ui-page portal-page--workbench">
      <header className="wb-greet" aria-label="欢迎信息">
        <div className="wb-greet__main">
          <h2 className="wb-greet__title">你好，{session?.user.nickname ?? '访客'}</h2>
          <p className="wb-greet__sub">AI 工具，一个入口全部搞定。</p>
        </div>
        <span className="ui-badge ui-badge--outline wb-greet__badge">{PORTAL_ENV_LABEL}</span>
      </header>

      <div className="wb-layout">
        <section className="wb-card" aria-label="常用应用">
          <div className="ui-section__head">
            <h2 className="ui-section__title">常用应用</h2>
            <Link className="ui-section__link" to="/preview/market">
              全部应用
              <span aria-hidden="true">
                <RightArrowOutlined style={{ fontSize: 12 }} />
              </span>
            </Link>
          </div>
          {view.status === 'loading' ? (
            <ul className="wb-applist" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <li key={index} className="wb-applist__skel">
                  <span className="ui-skeleton ui-skeleton--tile" />
                  <span className="ui-skeleton ui-skeleton--line" />
                </li>
              ))}
            </ul>
          ) : view.status === 'error' ? (
            <div className="ui-card ui-card--center">
              <div className="ui-errorstate" role="alert">
                <h3 className="ui-errorstate__title">无法加载常用应用</h3>
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
          ) : view.data.length > 0 ? (
            <ul className="wb-applist">
              {view.data.map((app) => (
                <li key={app.appId}>
                  <button
                    type="button"
                    className="wb-appitem"
                    onClick={() => setSearchParams({ app: app.appId })}
                  >
                    <AppIconTile visual={deriveVisual(app.appId)} size="l" />
                    <span className="wb-appitem__name">{app.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ui-card ui-card--center">
              <Empty title="还没有可用的应用" inline />
              <p className="ui-note">应用在管理端配置并启用后，会自动出现在这里。</p>
            </div>
          )}
        </section>

        <aside className="wb-rail" aria-label="平台公告、功能进展与应用统计">
          <AnnouncementCard />

          <section className="wb-card">
            <div className="ui-section__head">
              <h2 className="ui-section__title">功能进展</h2>
              <Link className="ui-section__link" to="/preview/status">
                去看进展
                <span aria-hidden="true">
                  <RightArrowOutlined style={{ fontSize: 12 }} />
                </span>
              </Link>
            </div>
            <ul className="wb-progress">
              {roadmap.map((stage) => (
                <li key={stage.key} className="wb-progress__item">
                  <span className="wb-progress__count ui-num" aria-hidden="true">{stage.count}</span>
                  <span className="wb-progress__meta">
                    <span className="wb-progress__title">{stage.title}</span>
                    <span className="wb-progress__summary">{stage.summary}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="wb-card" aria-label="应用统计">
            <dl className="wb-statcard">
              <div className="wb-statcard__stat">
                <dt>可用应用</dt>
                <dd className="ui-num">{stats.total}</dd>
              </div>
              <div className="wb-statcard__stat">
                <dt>小范围试运行</dt>
                <dd className="ui-num">{stats.canary}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <button
        type="button"
        className="wb-feedback"
        onClick={() => setFeedbackOpen(true)}
      >
        <MessageOutlined aria-hidden="true" />
        用着不顺手？点这里告诉我们
      </button>

      {feedbackOpen ? <FeedbackDrawer onClose={() => setFeedbackOpen(false)} /> : null}

      {activeApp ? (
        <AppDetailDrawer app={activeApp} onClose={() => setSearchParams({}, { replace: true })} />
      ) : null}
    </div>
  );
}
