import { useCallback, useEffect, useRef, useState } from 'react';
import { storageService } from '../../services/storageService';
import type { NotifyInput } from '../../services/notifications';

export type SaveStatus = 'saving' | 'saved' | 'idle' | 'error';

export interface PendingSave {
  id: string;
  content: string;
}

interface NotePersistenceDeps {
  notify: (input: NotifyInput) => void;
  /** 저장 성공 후 호출. 트리 lastModified 반영은 호출자가 맡는다. */
  onSaved: (id: string) => void;
  activeNoteId: string | null;
}

export interface NotePersistence {
  saveStatus: SaveStatus;
  /** 버퍼에 적재 + 800ms debounce 저장. */
  scheduleSave: (id: string, content: string) => void;
  /** pending 즉시 저장. 특정 노트 ID 또는 전체 큐를 플러시. */
  flush: (targetId?: string, opts?: { keepalive?: boolean }) => Promise<void>;
  peekPending: (id?: string) => PendingSave | null;
  adoptPending: (pending: PendingSave) => void;
  /** 타이머+버퍼 파기. 특정 노트 또는 전체 삭제 시 쓴다. */
  cancel: (id?: string) => void;
  resetStatus: () => void;
}

const DEBOUNCE_MS = 800;
const SAVED_IDLE_MS = 3500;

const beaconSave = (pending: PendingSave): boolean => {
  try {
    const blob = new Blob([JSON.stringify(pending)], { type: 'application/json' });
    return navigator.sendBeacon('api.php?action=save_content', blob);
  } catch {
    return false;
  }
};

const isPageHidden = (): boolean =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

// 노트 내용 저장 소유 훅. Map 기반 멀티 슬롯 pending 버퍼 + debounce + flush + 종료 저장을 맡는다.
// 다중 노트 간 전환 시에도 버퍼가 덮어씌워지지 않고 독립적으로 격리되어 안전하게 저장된다.
export const useNotePersistence = (deps: NotePersistenceDeps): NotePersistence => {
  const { notify, onSaved } = deps;
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const pendingMapRef = useRef<Map<string, string>>(new Map());
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeNoteIdRef = useRef<string | null>(deps.activeNoteId);
  useEffect(() => {
    activeNoteIdRef.current = deps.activeNoteId;
  }, [deps.activeNoteId]);

  const clearTimerFor = (id: string): void => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
  };

  const clearAllTimers = (): void => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current.clear();
  };

  const markSaved = useCallback((targetNoteId?: string) => {
    if (targetNoteId && activeNoteIdRef.current !== targetNoteId) return;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaveStatus('saved');
    savedTimerRef.current = setTimeout(() => {
      setSaveStatus('idle');
    }, SAVED_IDLE_MS);
  }, []);

  const markSaving = useCallback((targetNoteId?: string) => {
    if (targetNoteId && activeNoteIdRef.current !== targetNoteId) return;
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaveStatus('saving');
  }, []);

  const fail = useCallback(
    (detail?: string) => {
      notify({
        type: 'tree_error',
        message: detail || '저장 실패 — 네트워크를 확인하세요',
        duration: 6000,
      });
      setSaveStatus('error');
    },
    [notify]
  );

  const doSave = useCallback(
    async (id: string, content: string, opts?: { keepalive?: boolean }) => {
      try {
        if (opts?.keepalive) {
          // 종료 경로: 실제 keepalive fetch + sendBeacon fallback
          try {
            await storageService.saveContent(id, content, { keepalive: true });
          } catch {
            beaconSave({ id, content });
          }
        } else {
          await storageService.saveContent(id, content);
        }
        onSaved(id);
        markSaved(id);
      } catch {
        // hidden 상태에서 fetch가 죽으면(beacon 대상) beacon으로 넘기고
        // 죽은 페이지에 버퍼·에러 pill을 남기지 않는다.
        if (isPageHidden() && beaconSave({ id, content })) return;
        // 실패 시 해당 ID의 버퍼 복구 (다음 저장 시 재시도, 상태는 error 유지)
        pendingMapRef.current.set(id, content);
        fail();
      }
    },
    [onSaved, markSaved, fail]
  );

  const flush = useCallback(
    async (targetId?: string, opts?: { keepalive?: boolean }) => {
      if (targetId) {
        clearTimerFor(targetId);
        const content = pendingMapRef.current.get(targetId);
        if (content === undefined) return;
        pendingMapRef.current.delete(targetId);
        await doSave(targetId, content, opts);
      } else {
        clearAllTimers();
        const entries = Array.from(pendingMapRef.current.entries());
        if (entries.length === 0) return;
        pendingMapRef.current.clear();
        await Promise.all(entries.map(([id, content]) => doSave(id, content, opts)));
      }
    },
    [doSave]
  );

  const scheduleSave = useCallback(
    (id: string, content: string) => {
      pendingMapRef.current.set(id, content);
      markSaving(id);
      clearTimerFor(id);
      const timer = setTimeout(() => {
        clearTimerFor(id);
        const dataToSave = pendingMapRef.current.get(id);
        if (dataToSave !== undefined) {
          pendingMapRef.current.delete(id);
          void doSave(id, dataToSave);
        }
      }, DEBOUNCE_MS);
      timersRef.current.set(id, timer);
    },
    [markSaving, doSave]
  );

  const peekPending = useCallback((id?: string): PendingSave | null => {
    if (id) {
      const content = pendingMapRef.current.get(id);
      return content !== undefined ? { id, content } : null;
    }
    const currentId = activeNoteIdRef.current;
    if (currentId && pendingMapRef.current.has(currentId)) {
      return { id: currentId, content: pendingMapRef.current.get(currentId)! };
    }
    const first = pendingMapRef.current.entries().next();
    if (!first.done) {
      return { id: first.value[0], content: first.value[1] };
    }
    return null;
  }, []);

  const adoptPending = useCallback((pending: PendingSave) => {
    pendingMapRef.current.set(pending.id, pending.content);
  }, []);

  const cancel = useCallback((id?: string) => {
    if (id) {
      clearTimerFor(id);
      pendingMapRef.current.delete(id);
    } else {
      clearAllTimers();
      pendingMapRef.current.clear();
    }
  }, []);

  const resetStatus = useCallback(() => {
    setSaveStatus('idle');
  }, []);

  // 탭 닫기/숨김 시 모든 pending 저장 (keepalive 및 beacon)
  useEffect(() => {
    const handleBeforeUnload = () => {
      for (const [id, content] of pendingMapRef.current.entries()) {
        beaconSave({ id, content });
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingMapRef.current.size > 0) {
        flush(undefined, { keepalive: true });
      }
    };
    const handlePageHide = () => {
      for (const [id, content] of pendingMapRef.current.entries()) {
        beaconSave({ id, content });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [flush]);

  return { saveStatus, scheduleSave, flush, peekPending, adoptPending, cancel, resetStatus };
};
