/**
 * Email Normalization Utility (Backend)
 *
 * Normalizes email addresses to break burner email services.
 * Gmail ignores dots, but burner services don't - so normalizing
 * j.o.h.n@gmail.com to john@gmail.com will break their interception.
 *
 * This is a defense-in-depth measure - the frontend also normalizes,
 * but we store the normalized email in the database as a secondary check.
 */

const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

const PLUS_ALIAS_DOMAINS = [
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'ymail.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'fastmail.com', 'fastmail.fm',
  'aol.com'
];

/**
 * Normalize an email address to break burner email services.
 *
 * For Gmail domains:
 * - Removes dots from local part (j.o.h.n -> john)
 * - Strips plus aliases (user+anything -> user)
 *
 * For other major providers:
 * - Strips plus aliases only
 *
 * @param {string} email - The email address to normalize
 * @returns {string} The normalized email address
 */
function normalizeEmail(email) {
  if (!email) return '';

  const emailLower = email.toLowerCase().trim();
  const atIndex = emailLower.lastIndexOf('@');

  if (atIndex === -1) return emailLower;

  let localPart = emailLower.substring(0, atIndex);
  const domain = emailLower.substring(atIndex + 1);

  // Strip plus aliases (user+anything -> user)
  if (PLUS_ALIAS_DOMAINS.includes(domain)) {
    const plusIndex = localPart.indexOf('+');
    if (plusIndex !== -1) {
      localPart = localPart.substring(0, plusIndex);
    }
  }

  // Strip dots for Gmail only
  if (GMAIL_DOMAINS.includes(domain)) {
    localPart = localPart.replace(/\./g, '');
  }

  return `${localPart}@${domain}`;
}

/**
 * Check if an email appears to be using a burner-style pattern.
 * This is a heuristic check for suspicious Gmail addresses with many dots.
 *
 * @param {string} email - The email to check
 * @returns {boolean} true if the email looks suspicious
 */
function isSuspiciousEmail(email) {
  if (!email) return false;

  const emailLower = email.toLowerCase().trim();
  const atIndex = emailLower.lastIndexOf('@');

  if (atIndex === -1) return false;

  const localPart = emailLower.substring(0, atIndex);
  const domain = emailLower.substring(atIndex + 1);

  // Only check Gmail domains for suspicious patterns
  if (!GMAIL_DOMAINS.includes(domain)) return false;

  // Count dots in local part
  const dotMatches = localPart.match(/\./g);
  const dotCount = dotMatches ? dotMatches.length : 0;

  // More than 3 dots in local part is suspicious
  // e.g., j.o.h.n.d.o.e@gmail.com
  if (dotCount > 3) return true;

  // Check for alternating dot pattern (e.g., j.o.h.n)
  // This catches single character segments separated by dots
  const segments = localPart.split('.');
  const singleCharSegments = segments.filter(s => s.length === 1).length;

  // If more than half the segments are single characters, suspicious
  if (segments.length > 2 && singleCharSegments > segments.length / 2) {
    return true;
  }

  return false;
}

module.exports = {
  normalizeEmail,
  isSuspiciousEmail,
  GMAIL_DOMAINS,
  PLUS_ALIAS_DOMAINS
};
