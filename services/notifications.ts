import type { TopBarNotification } from '../types';

// 타입화 알림 seam의 순수 연산층. 보관 key 규칙과 교체 정책을 소유한다.
// 상태·타이머는 components/hooks/useNotifications.ts가 맡는다.

export type NotifyType = TopBarNotification['type'];

export interface NotifyInput {
  type: NotifyType;
  message: string;
  /** 같은 key는 교체된다. 생략 시 카테고리(ai|tree|other)가 key가 된다. */
  key?: string;
  /** ms. 0 이하면 sticky(자동 해제 없음). 생략 시 DEFAULT_DURATION. */
  duration?: number;
  /** true면 duration과 무관하게 자동 해제하지 않는다. */
  sticky?: boolean;
}

export interface StoredNotification extends TopBarNotification {
  key: string;
}

export const DEFAULT_DURATION = 3500;

export const categoryOf = (type: NotifyType): string =>
  type.startsWith('ai_') ? 'ai' : type.startsWith('tree_') ? 'tree' : 'other';

export const keyOf = (input: NotifyInput): string => input.key ?? categoryOf(input.type);

// 같은 key를 가진 기존 항목을 교체하고 새 항목을 끝에 둔다. 입력은 변경하지 않는다.
export const upsertNotification = (
  list: StoredNotification[],
  input: NotifyInput,
  id: string
): StoredNotification[] => {
  const key = keyOf(input);
  const entry: StoredNotification = { id, type: input.type, message: input.message, key };
  return [...list.filter((n) => n.key !== key), entry];
};

export const dismissNotification = (list: StoredNotification[], id: string): StoredNotification[] =>
  list.filter((n) => n.id !== id);
