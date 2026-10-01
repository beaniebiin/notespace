import { FileSystemNode } from '../types';

export interface SearchResultItem {
  id: string;
  title: string;
  snippet: string;
  score?: number;
}

const PARTICLES = [
  '에서', '에게', '으로', '부터', '까지', '보다', '처럼',
  '에는', '에도', '은', '는', '이', '가', '을', '를',
  '의', '에', '로', '와', '과', '도', '만'
];

interface TokenGroup {
  raw: string;
  stem: string | null;
}

/**
 * Clean markdown syntax and HTML tags to generate searchable plain text
 */
export function cleanMarkdown(markdown: string): { clean: string; nospace: string } {
  if (!markdown) return { clean: '', nospace: '' };

  let text = markdown;
  // Remove markdown images: ![alt](url)
  text = text.replace(/!\[[^\]]*\]\([^)]+\)/g, '');
  // Simplify markdown links: [text](url) -> text
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Strip HTML tags
  text = text.replace(/<\/?[^>]+(>|$)/g, ' ');
  // Remove formatting marks: #, *, _, `, ~, >, |, \
  text = text.replace(/[#_*`~>|\\]+/g, ' ');
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();

  const nospace = text.replace(/\s+/g, '');
  return { clean: text, nospace };
}

/**
 * Tokenize query and remove common Korean grammatical particles
 */
export function tokenizeQuery(query: string): { tokenGroups: TokenGroup[]; noSpaceQuery: string } {
  const rawTokens = query.trim().split(/\s+/).filter(Boolean);
  const noSpaceQuery = query.replace(/\s+/g, '');

  const tokenGroups: TokenGroup[] = rawTokens.map((tok) => {
    let stem: string | null = null;
    for (const p of PARTICLES) {
      if (tok.length > p.length + 1 && tok.endsWith(p)) {
        stem = tok.substring(0, tok.length - p.length);
        break;
      }
    }
    return { raw: tok, stem };
  });

  return { tokenGroups, noSpaceQuery };
}

/**
 * Generate a contextual snippet around matched keywords
 */
export function generateSnippet(cleanText: string, tokenGroups: TokenGroup[], noSpaceQuery: string): string {
  if (!cleanText) return '';
  const textLen = cleanText.length;
  if (textLen <= 120) return cleanText;

  // Find all match positions
  const positions: number[] = [];
  const lowerText = cleanText.toLowerCase();

  for (const tg of tokenGroups) {
    const rawLower = tg.raw.toLowerCase();
    let pos = lowerText.indexOf(rawLower);
    if (pos !== -1) positions.push(pos);

    if (tg.stem) {
      const stemLower = tg.stem.toLowerCase();
      let stemPos = lowerText.indexOf(stemLower);
      if (stemPos !== -1) positions.push(stemPos);
    }
  }

  if (positions.length === 0) {
    return cleanText.substring(0, 100) + '...';
  }

  positions.sort((a, b) => a - b);

  // Extract snippet around the first match
  const firstPos = positions[0];
  const start = Math.max(0, firstPos - 35);
  const end = Math.min(textLen, firstPos + 75);

  let snippet = cleanText.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < textLen) snippet = snippet + '...';

  return snippet;
}

/**
 * Execute client-side full text search across active notes
 */
export function searchNotesInMemory(
  query: string,
  tree: FileSystemNode[],
  noteContentsMap: Map<string, string>
): SearchResultItem[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  // 1. Extract active notes from tree (exclude orphaned/trash)
  const activeNotes = new Map<string, string>(); // id -> title
  const extractActive = (nodes: FileSystemNode[]) => {
    for (const node of nodes) {
      if (node.type === 'note' && node.id) {
        activeNotes.set(node.id, node.name || 'Untitled');
      }
      if (node.children && Array.isArray(node.children)) {
        extractActive(node.children);
      }
    }
  };
  extractActive(tree);

  if (activeNotes.size === 0) return [];

  // 2. Tokenize search query
  const { tokenGroups, noSpaceQuery } = tokenizeQuery(trimmed);
  const results: Array<SearchResultItem & { score: number }> = [];

  // 3. Search over notes
  for (const [id, title] of activeNotes.entries()) {
    const content = noteContentsMap.get(id) || '';
    const { clean, nospace } = cleanMarkdown(content);

    const titleLower = title.toLowerCase();
    const titleNoSpace = title.replace(/\s+/g, '').toLowerCase();
    const contentLower = clean.toLowerCase();
    const contentNoSpace = nospace.toLowerCase();
    const queryNoSpaceLower = noSpaceQuery.toLowerCase();

    let score = 0;
    let matchedTokenCount = 0;
    let isPhraseMatched = false;

    // A. Phrase match (ignoring whitespace)
    if (queryNoSpaceLower.length >= 2) {
      if (contentNoSpace.includes(queryNoSpaceLower)) {
        isPhraseMatched = true;
        score += 120;
      }
      if (titleNoSpace.includes(queryNoSpaceLower)) {
        isPhraseMatched = true;
        score += 150;
      }
    }

    // B. Token & Stem matching
    for (const tg of tokenGroups) {
      const rawLower = tg.raw.toLowerCase();
      const stemLower = tg.stem ? tg.stem.toLowerCase() : null;
      let tokenMatched = false;

      // Title check
      if (titleLower.includes(rawLower) || (stemLower && titleLower.includes(stemLower))) {
        score += 40;
        tokenMatched = true;
      }

      // Content check
      if (contentLower.includes(rawLower) || (stemLower && contentLower.includes(stemLower))) {
        score += 20;
        tokenMatched = true;
      }

      if (tokenMatched) {
        matchedTokenCount++;
      }
    }

    // Must match at least one token or phrase
    if (matchedTokenCount === 0 && !isPhraseMatched) {
      continue;
    }

    // Bonus for matching all tokens
    if (matchedTokenCount === tokenGroups.length && tokenGroups.length > 1) {
      score += 50;
    }

    const snippet = generateSnippet(clean, tokenGroups, noSpaceQuery);

    results.push({
      id,
      title,
      snippet,
      score
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, 30).map(({ id, title, snippet }) => ({ id, title, snippet }));
}
