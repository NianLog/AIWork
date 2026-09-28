import { useEffect } from 'react';
import { Button, Empty } from 'dingtalk-design-mobile';
import { useNotificationsStore } from '../../store/notifications';
import type { PortalNotification } from '../../api/yudao';

/**
 * 消息中心（批次 V）：平台公告广播与后续安全提醒的站内信收件箱。
 *
 * - 数据是收件箱快照（最近 50 条，时间倒序），进页拉一次；标已读后 store
 *   重拉列表与未读数，导航徽标即时归零；
 * - 时间格式化兼容毫秒数（后端 LocalDateTime 的实际序列化形态）与 ISO 串。
 */

/** MM-dd HH:mm；非当年补年份——消息是短生命周期内容，精确到分够用 */
function formatTime(value: number | string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${d.getFullYear()}-${base}`;
}

function NotificationItem({ item, onRead }: { item: PortalNotification; onRead: (id: number) => void }) {
  return (
    <li className={`wb-announce__item ntf-item${item.readFlag ? '' : ' ntf-item--unread'}`}>
      <div className="wb-announce__title">
        {item.readFlag ? null : (
          <span className="ntf-dot" aria-hidden="true" />
        )}
        {item.title}
        {item.readFlag ? null : (
          <button type="button" className="ntf-readbtn" onClick={() => onRead(item.id)}>
            标为已读
          </button>
        )}
      </div>
      {item.content ? <p className="wb-announce__content">{item.content}</p> : null}
      <span className="wb-announce__time ntf-time">{formatTime(item.createTime)}</span>
    </li>
  );
}

export default function NotificationsPage() {
  const list = useNotificationsStore((s) => s.list);
  const listStatus = useNotificationsStore((s) => s.listStatus);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const fetchList = useNotificationsStore((s) => s.fetchList);
  const markRead = useNotificationsStore((s) => s.markRead);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  return (
    <section className="wb-card" aria-label="消息中心">
      <div className="ui-section__head">
        <h2 className="ui-section__title">收件箱</h2>
        {unreadCount !== null && unreadCount > 0 && listStatus === 'success' ? (
          <Button size="small" onClick={() => void markAllRead()}>
            全部已读（{unreadCount}）
          </Button>
        ) : null}
      </div>

      {listStatus === 'loading' ? (
        <div aria-busy="true">
          <span className="ui-skeleton ui-skeleton--line" />
          <span className="ui-skeleton ui-skeleton--line" />
        </div>
      ) : null}

      {listStatus === 'error' ? (
        <div className="ntf-state">
          <p>消息暂时没有取到，稍后重试一般就能恢复。</p>
          <Button size="small" onClick={() => void fetchList()}>
            重试
          </Button>
        </div>
      ) : null}

      {listStatus === 'success' ? (
        list.length === 0 ? (
          <Empty title="还没有消息" inline />
        ) : (
          <ul className="wb-announce ntf-list">
            {list.map((item) => (
              <NotificationItem key={item.id} item={item} onRead={(id) => void markRead(id)} />
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
