/**
 * NoteSpace Text Statistics Service
 *
 * Provides real-time word/character count and text calculation utilities
 * for the right sidebar and Obsidian-style status bar.
 */

export interface TextStatistics {
  words: number;
  characters: number;
  charactersNoSpaces: number;
}

/**
 * Computes word and character counts from raw note markdown or HTML content.
 */
export function computeTextStatistics(rawContent: string | null | undefined): TextStatistics {
  if (!rawContent || typeof rawContent !== 'string') {
    return { words: 0, characters: 0, charactersNoSpaces: 0 };
  }

  // 1. Strip HTML tags (e.g. <p>, <mark>, <div>)
  const textWithoutTags = rawContent.replace(/<[^>]*>/g, ' ');

  // 2. Decode common HTML entities
  const decodedText = textWithoutTags
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  const normalizedText = decodedText.replace(/\r/g, '');
  const charactersNoSpaces = normalizedText.replace(/\s/g, '').length;

  // If text has no visible characters, return all zeros
  if (charactersNoSpaces === 0) {
    return { words: 0, characters: 0, charactersNoSpaces: 0 };
  }

  // Trim leading/trailing whitespace to count clean length and words
  const trimmed = normalizedText.trim();
  const characters = trimmed.length;
  const words = trimmed.split(/\s+/).filter(Boolean).length;

  return { words, characters, charactersNoSpaces };
}

/**
 * Naturally sorts item names in ascending order, respecting numeric digit values.
 */
export function naturalSortItems(items: string[]): string[] {
  return [...items].sort((a, b) => {
    const normA = a.replace(/\s+/g, ' ').trim();
    const normB = b.replace(/\s+/g, ' ').trim();
    return normA.localeCompare(normB, 'ko-KR', { numeric: true, sensitivity: 'base' });
  });
}
