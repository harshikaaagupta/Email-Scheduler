const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Extracts and de-duplicates email addresses from an uploaded CSV/TXT
 * lead file. Deliberately lenient about the file's exact shape (one
 * column, many columns, with/without a header row) - we just scan every
 * cell for anything that looks like an email address.
 */
export function extractEmailsFromText(content: string): string[] {
  const matches = content.match(EMAIL_REGEX) ?? [];
  const unique = new Set(matches.map((email) => email.trim().toLowerCase()));
  return Array.from(unique);
}
