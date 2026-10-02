## 2025-02-17 - Root Tree Traversal Re-renders on Scroll & Autosave
**Learning:** In React applications with deep file tree structures, recalculating active node, breadcrumbs, and tag collections at the root level (`App.tsx`) on every render causes full-tree recursive traversals during high-frequency events (e.g. scrollspy updating `activeHeadingId` or autosave state ticks).
**Action:** Always memoize root tree derived data (`activeNode`, `breadcrumbs`, `allTags`) with `useMemo` dependent on `[fileSystem, activeNoteId]` to avoid redundant recursions and unstable prop references.
