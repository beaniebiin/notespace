import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DURATION,
  dismissNotification,
  keyOf,
  upsertNotification,
  type NotifyInput,
  type StoredNotification,
} from '../../services/notifications';

const genId = (): string => `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

export interface Notifications {
  notifications: StoredNotification[];
  /** 알림을 올리고 id를 돌려준다. 같은 key는 교체된다. */
  notify: (input: NotifyInput) => string;
  dismiss: (id: string) => void;
}

// 알림 상태 소유 훅. 보관 정책은 services/notifications.ts가 소유한다.
export const useNotifications = (): Notifications => {
  const [notifications, setNotifications] = useState<StoredNotification[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = (id: string): void => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  };

  const dismiss = useCallback((id: string): void => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setNotifications((prev) => dismissNotification(prev, id));
  }, []);

  const notify = useCallback(
    (input: NotifyInput): string => {
      const id = genId();
      const key = keyOf(input);
      setNotifications((prev) => {
        prev.forEach((n) => {
          if (n.key === key) {
            const t = timers.current.get(n.id);
            if (t) {
              clearTimeout(t);
              timers.current.delete(n.id);
            }
          }
        });
        return upsertNotification(prev, input, id);
      });
      const duration = input.sticky ? 0 : (input.duration ?? DEFAULT_DURATION);
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss]
  );

  useEffect(
    () => () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current.clear();
    },
    []
  );

  return { notifications, notify, dismiss };
};
