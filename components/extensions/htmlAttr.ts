/**
 * HTML attribute value escaping helper.
 *
 * Encodes special characters and line breaks as entities so tags stay single-line in Markdown serialization.
 * Browser's getAttribute automatically decodes these entities.
 */
export function escapeHtmlAttr(str: string | null | undefined): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '&#10;');
}
