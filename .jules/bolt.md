## 2026-10-09 - Memoize Markdown Cleaning in Client Search
**Learning:** `cleanMarkdown` runs 5 sequential regular expression replacements on note contents per search keypress. Caching plain text conversions in a bounded Map LRU cache eliminates redundant regex overhead when typing in search.
**Action:** Always check string conversion and regex functions called within per-keystroke or render loops for caching opportunities.
