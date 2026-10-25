# NoteSpace RightSidebar 플러그인(Clip) 개발 가이드라인

NoteSpace의 우측 사이드바(Right Sidebar) 플러그인 생태계를 위한 공식 개발 표준 및 가이드라인입니다.  
향후 구현되는 모든 기본 플러그인과 외부 빌더(Builder)가 제작하는 커스텀 확장 기능은 본 문서의 원칙과 규약을 준수해야 합니다.

---

## 1. 핵심 철학 및 아키텍처 원칙

1. **단일 계약 원칙 (Single Contract Principle)**:
   - 모든 플러그인은 [RightSidebarTypes.ts](file:///e:/notespace_neo/components/right-sidebar/RightSidebarTypes.ts)에 정의된 `RightSidebarPlugin` 인터페이스 규약을 준수합니다.
2. **컨텍스트 주입 및 제어 역전 (Inversion of Control via Context)**:
   - 플러그인은 메인 에디터의 DOM이나 상위 컴포넌트 상태를 직접 조작하지 않고, 컨테이너가 주입하는 [RightSidebarContext](file:///e:/notespace_neo/components/right-sidebar/RightSidebarTypes.ts)를 통해서만 데이터를 읽고 액션을 호출합니다.
3. **비침습성 및 오류 격리 (Non-invasive Failure Isolation)**:
   - 플러그인 내부의 런타임 오류나 지연이 메인 에디터의 타이핑, 문서 렌더링, 또는 자동 저장 파이프라인을 방해하거나 중단시키지 않아야 합니다.
4. **오프라인-퍼스트 & 로컬 주권 (Offline-First & Local Sovereignty)**:
   - 외부 중앙 서버 의존 없이 로컬 스토리지(`localStorage`), 로컬 파일시스템, 또는 Tauri 네이티브 API 기반으로 독립 구동되어야 합니다.
5. **공간 최적화 및 반응형 (Compact Space-Constrained Layout)**:
   - 우측 사이드바는 폭이 `w-64` (~256px) 또는 `w-72` (~288px)로 제한되므로, 가로 스크롤 깨짐 방지(`truncate`, `min-w-0`) 및 컴팩트한 타이포그래피(`text-[12px]` ~ `text-[13.5px]`)를 유지해야 합니다.

---

## 2. 네이밍 및 브랜딩 규칙

* **플러그인 명칭 (Title)**:
  - 사용자에게 노출되는 공식 명칭은 일관된 접미사 **`*Clip`** 형태를 사용합니다.
  - *사례*: `TraceClip` (백링크), `IndexClip` (추출기), `MemoClip` (메모장), `MeowClip` (고양이 쉼터), `IdeaClip` (AI), `SkillClip` (프롬프트/스킬).
* **고유 식별자 (`id`)**:
  - 소문자 영문 케밥 케이스(`kebab-case`) (예: `scratchpad`, `backlinks`, `extract`, `cat`).
* **아이콘 (`icon`)**:
  - `lucide-react` 라이브러리의 표준 아이콘 컴포넌트를 등록합니다.
  - 탭바 내에서는 28px 정사각형 규격(`w-7 h-7 flex-center`) 및 아이콘 크기 `14px`로 렌더링됩니다.

---

## 3. 인터페이스 명세

```typescript
// components/right-sidebar/RightSidebarTypes.ts

export interface RightSidebarContext {
  /** 현재 열려있는 노트 ID (없으면 null) */
  activeNoteId: string | null;
  /** 현재 열려있는 노트 제목 */
  activeNoteTitle: string;
  /** 현재 노트 본문 마크다운 원문 */
  editorContent: string;
  /** 실시간 단어 수 및 글자 수 통계 */
  statistics: TextStatistics;
  /** 다른 노트 또는 특정 헤딩 섹션으로 이동 트리거 */
  onNavigateLink: (targetNoteId?: string | null, targetSectionId?: string | null) => void;
  /** 에디터 현재 커서 위치에 마크다운 텍스트 삽입 트리거 */
  onInsertMarkdown?: (markdown: string) => void;
}

export interface RightSidebarPlugin {
  /** 플러그인 고유 ID */
  id: string;
  /** 탭 툴팁 및 접근성에 표출될 이름 (*Clip 권장) */
  title: string;
  /** 탭바에 표시될 Lucide 아이콘 컴포넌트 */
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** 툴팁 안내 문구 (생략 시 title 사용) */
  tooltip?: string;
  /** 탭 버튼 우상단에 표시될 동적 뱃지 (숫자, '•', 'ing' 등) */
  badge?: (ctx: RightSidebarContext) => number | string | undefined;
  /** 플러그인 뷰포트에 렌더링될 React 컴포넌트 */
  render: (ctx: RightSidebarContext) => React.ReactNode;
}
```

---

## 4. 표준 플러그인 UI 레이아웃 구조

모든 플러그인 컴포넌트는 사이드바의 하단 ~35% 뷰포트 내부에서 아래 3단계 계층 구조를 따르는 것을 권장합니다:

```
┌──────────────────────────────────────────────┐
│ 1. 상단 미니 툴바 / 상태바 (Header Strip)     │  <- h-7~h-8, 상태/카운트 표시, 복사/삭제 버튼
├──────────────────────────────────────────────┤
│                                              │
│ 2. 본문 스크롤 영역 (Content Viewport)        │  <- flex-1 min-h-0 overflow-y-auto pr-0.5
│    - 항목 카드 리스트 or 입력 폼             │     custom-scrollbar text-[13.5px]
│    - 빈 상태(Empty State) 안내               │
│                                              │
├──────────────────────────────────────────────┤
│ 3. 하단 컨트롤 또는 입력창 (선택 사항)        │  <- shrink-0, 프롬프트 입력창, 액션 바
└──────────────────────────────────────────────┘
```

### 필수 UI 패턴
1. **빈 상태 (Empty State)**:
   - 데이터나 결과가 없을 때 빈 화면으로 방치하지 않고, 은은한 아이콘(투명도 40%)과 안내 텍스트를 중앙 배치합니다.
   ```tsx
   <div className="flex flex-col items-center justify-center py-6 px-3 text-center text-gray-400/80 dark:text-gray-500/80">
     <Icon size={16} className="mb-1 opacity-40" />
     <span className="text-[12px] leading-relaxed">표시할 항목이 없습니다</span>
   </div>
   ```
2. **2단계 인라인 확인 (Inline Safe Confirmation)**:
   - 데이터 삭제/비우기 등 파괴적 작업 시 모달 팝업 대신 버튼 자체가 인라인으로 "지울까요?"로 전환되는 2단계 확인 패턴을 적용합니다.
3. **복사 성공 피드백 (Copy Feedback)**:
   - 클립보드 복사 시 `Copy` 아이콘이 1.5초간 녹색 `Check` 아이콘으로 전환되는 즉각 피드백을 제공합니다.

---

## 5. 데이터 저장 및 상태 관리 지침

| 데이터 유형 | 권장 저장소 | 예시 |
| :--- | :--- | :--- |
| **일시적 UI 상태** | React `useState`, `useRef` | 탭 전환, 폼 입력 중 텍스트, 모달 열림 여부 |
| **브라우저 세션 캐시** | `localStorage` (`notespace_<plugin>_*`) | 스크래치패드 내용, 최근 검색 기록, 접힘 상태 |
| **노트 연동 데이터** | `ctx.editorContent`, `ctx.onInsertMarkdown` | 본문 마크다운 삽입, 하이라이트 실시간 분석 |
| **영구 대용량 데이터** | Tauri Native FS / 로컬 파일 (`data/`) | 스냅샷 아카이브, 사용자 정의 템플릿/스킬 |

---

## 6. 표준 플러그인 템플릿 코드

빌더가 새로운 플러그인을 제작할 때 시작점으로 활용할 수 있는 표준 보일러플레이트입니다:

```tsx
// components/right-sidebar/plugins/MyToolPlugin.tsx
import React, { useState } from 'react';
import { Wrench, Copy, Check } from 'lucide-react';
import { RightSidebarPlugin, RightSidebarContext } from '../RightSidebarTypes';

export const MyToolComponent: React.FC<{ ctx: RightSidebarContext }> = ({ ctx }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyTitle = async () => {
    await navigator.clipboard.writeText(ctx.activeNoteTitle);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="h-full flex flex-col min-h-0 text-[13.5px]">
      {/* 1. Header Strip */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-gray-100 dark:border-gray-800 text-[11px] text-gray-400 shrink-0 select-none">
        <span className="font-medium text-gray-500 dark:text-gray-400 tracking-tight">
          내 도구
        </span>
        <button
          type="button"
          onClick={handleCopyTitle}
          className="p-1 rounded hover:bg-gray-200/60 dark:hover:bg-gray-800 text-gray-500 transition-colors cursor-pointer"
          title="문서 제목 복사"
        >
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
        </button>
      </div>

      {/* 2. Scrollable Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 custom-scrollbar space-y-2">
        <div className="p-2 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-200/60 dark:border-gray-800/60 text-xs">
          <p className="font-semibold text-gray-700 dark:text-gray-200">{ctx.activeNoteTitle}</p>
          <p className="text-gray-400 text-[11px] mt-1">단어 수: {ctx.statistics.words}개</p>
        </div>
      </div>
    </div>
  );
};

export const MyToolPlugin: RightSidebarPlugin = {
  id: 'my-tool',
  title: 'ToolClip',
  tooltip: 'ToolClip (사용자 도구)',
  icon: Wrench,
  badge: (ctx) => ctx.statistics.words || undefined,
  render: (ctx) => <MyToolComponent ctx={ctx} />,
};

export default MyToolPlugin;
```

---

## 7. 플러그인 등록 방법

작성한 플러그인을 [components/right-sidebar/plugins/index.ts](file:///e:/notespace_neo/components/right-sidebar/plugins/index.ts)에 등록합니다:

```typescript
import { defaultRightSidebarPlugins, registerRightSidebarPlugin } from './plugins';
import { MyToolPlugin } from './plugins/MyToolPlugin';

// 1. 기본 레지스트리에 정적 포함
export const defaultRightSidebarPlugins: RightSidebarPlugin[] = [
  ScratchpadPlugin,
  MyToolPlugin,
];

// 2. 또는 런타임에 동적 확장
const extendedPlugins = registerRightSidebarPlugin(defaultRightSidebarPlugins, MyToolPlugin);
```
