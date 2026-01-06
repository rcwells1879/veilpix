/**
 * Email Domain Allowlist Validator
 *
 * Only allows email domains from trusted providers that require identity
 * verification (phone/SMS verification or equivalent barriers).
 *
 * This prevents abuse from burner/disposable email addresses.
 * Also detects:
 * - Plus-sign aliasing tricks (user+alias@domain) on all major providers
 * - Gmail dot tricks (j.o.h.n@gmail.com = john@gmail.com)
 * - Gibberish/random string local parts indicating bot-generated emails
 */

// Gmail domains (for dot-ignoring validation - Gmail treats dots as optional)
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

// All domains that support plus-sign aliasing (block + for all of these)
const PLUS_ALIASING_DOMAINS = [
    // Gmail
    'gmail.com', 'googlemail.com',
    // Microsoft
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    // Yahoo
    'yahoo.com', 'ymail.com',
    // Apple
    'icloud.com', 'me.com', 'mac.com',
    // Privacy providers
    'protonmail.com', 'proton.me', 'pm.me',
    'fastmail.com', 'fastmail.fm',
    // Regional/Other
    'gmx.com', 'gmx.net', 'gmx.de', 'web.de',
    'zohomail.com',
    'aol.com'
];

// Trusted email domains organized by provider tier
const ALLOWED_DOMAINS = [
    // Tier 1: Major Global Providers (Phone Verification Required)
    'gmail.com',                    // Google - 1.8B users
    'outlook.com',                  // Microsoft
    'hotmail.com',                  // Microsoft (legacy)
    'live.com',                     // Microsoft (legacy)
    'msn.com',                      // Microsoft (legacy)
    'yahoo.com',                    // Yahoo
    'ymail.com',                    // Yahoo (alternate)
    'icloud.com',                   // Apple
    'me.com',                       // Apple (legacy)
    'mac.com',                      // Apple (legacy)
    'aol.com',                      // AOL

    // Tier 2: Privacy-Focused Providers (Legitimate Services)
    'protonmail.com',               // ProtonMail (Swiss)
    'proton.me',                    // ProtonMail (new domain)
    'pm.me',                        // ProtonMail (short domain)
    'tutanota.com',                 // Tutanota/Tuta (German)
    'tuta.io',                      // Tuta (new domain)
    'fastmail.com',                 // Fastmail (Australian, paid)
    'fastmail.fm',                  // Fastmail (alternate)

    // Tier 3: Regional Providers (Established Services)
    'gmx.com',                      // GMX (German, 20M users)
    'gmx.net',                      // GMX (alternate)
    'gmx.de',                       // GMX (German domain)
    'web.de',                       // Web.de (German)
    'zohomail.com',                 // Zoho (Business-focused)
];

// Human-readable provider names for error messages
const SUPPORTED_PROVIDERS = [
    'Gmail',
    'Outlook',
    'Hotmail',
    'Yahoo',
    'iCloud',
    'ProtonMail',
    'Tutanota',
    'Fastmail',
    'GMX',
    'Zoho'
];

/**
 * Validate plus-sign aliasing for all major email providers
 * Many providers (Gmail, Outlook, Yahoo, etc.) support + aliases,
 * allowing users to create unlimited addresses from a single account.
 *
 * @param {string} localPart - The part before @ in the email
 * @param {string} domain - The email domain
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validatePlusAliasing(localPart, domain) {
    // Only check domains that support plus aliasing
    if (!PLUS_ALIASING_DOMAINS.includes(domain)) {
        return { valid: true, reason: null };
    }

    // Check for plus sign (e.g., user+alias@outlook.com)
    if (localPart.includes('+')) {
        return {
            valid: false,
            reason: 'Email addresses with + symbols are not supported. Please use your standard email address without the + portion.'
        };
    }

    return { valid: true, reason: null };
}

/**
 * Validate email addresses for multiple periods in local part
 * Multiple periods (2+) in the local part are blocked for ALL providers.
 * This catches abuse patterns like j.o.h.n@example.com or disposable generators.
 *
 * @param {string} localPart - The part before @ in the email
 * @param {string} domain - The email domain
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateMultiplePeriods(localPart, domain) {
    // Count periods in local part (allow 1, block 2+)
    const periodCount = (localPart.match(/\./g) || []).length;
    if (periodCount >= 2) {
        return {
            valid: false,
            reason: 'Email addresses with multiple periods are not supported. Please use your standard email address.'
        };
    }

    return { valid: true, reason: null };
}

/**
 * Detect if a local part looks like random/gibberish characters
 * indicating a bot-generated or burner email address.
 *
 * Uses multiple heuristics with a scoring system:
 * - Low vowel ratio (real names typically have 30-40% vowels)
 * - High number density
 * - Long consonant runs
 *
 * Conservative threshold (3+ points) to minimize false positives.
 *
 * @param {string} localPart - The part before @ in the email
 * @returns {{ suspicious: boolean, reason: string|null }}
 */
function detectGibberish(localPart) {
    // Remove common separators for analysis
    const cleaned = localPart.replace(/[._-]/g, '').toLowerCase();

    // Skip short local parts (too little data to analyze)
    if (cleaned.length < 6) {
        return { suspicious: false, reason: null };
    }

    const vowels = cleaned.match(/[aeiou]/g) || [];
    const numbers = cleaned.match(/[0-9]/g) || [];
    const letters = cleaned.match(/[a-z]/g) || [];

    // Calculate ratios
    const vowelRatio = letters.length > 0 ? vowels.length / letters.length : 0;
    const numberRatio = cleaned.length > 0 ? numbers.length / cleaned.length : 0;

    // Flag 1: Very low vowel ratio (real names typically have 30-40% vowels)
    // "adlqgn" has 0% vowels - highly suspicious
    const lowVowels = vowelRatio < 0.15 && letters.length >= 5;

    // Flag 2: High number density in longer strings
    // "27993n" style patterns - more than 50% numbers with 4+ numbers total
    const highNumbers = numberRatio > 0.5 && numbers.length >= 4;

    // Flag 3: Long strings of consonants (4+ consecutive)
    // "qwrtplkj" has 8 consecutive consonants
    const consonantRun = /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(cleaned);

    // Calculate suspicion score
    let score = 0;
    if (lowVowels) score += 2;
    if (highNumbers) score += 2;
    if (consonantRun) score += 1;

    // Conservative threshold: 3+ points = suspicious
    // This catches "adlqgn27993n" (lowVowels=2 + highNumbers=2 + consonantRun=1 = 5)
    // But allows "john123" (none of the flags trigger)
    if (score >= 3) {
        return {
            suspicious: true,
            reason: 'This email address appears to be auto-generated. Please use a personal email address.'
        };
    }

    return { suspicious: false, reason: null };
}

/**
 * Validate if an email domain is in the allowlist
 *
 * @param {string} email - The email address to validate
 * @returns {{ allowed: boolean, domain: string|null, reason: string }}
 */
function validateEmailDomain(email) {
    if (!email || typeof email !== 'string') {
        return {
            allowed: false,
            domain: null,
            reason: 'No email address provided'
        };
    }

    const emailLower = email.toLowerCase().trim();
    const atIndex = emailLower.lastIndexOf('@');

    if (atIndex === -1 || atIndex === 0 || atIndex === emailLower.length - 1) {
        return {
            allowed: false,
            domain: null,
            reason: 'Invalid email format'
        };
    }

    const localPart = emailLower.substring(0, atIndex);
    const domain = emailLower.substring(atIndex + 1);

    if (ALLOWED_DOMAINS.includes(domain)) {
        // Check 1: Plus-sign aliasing (all major providers)
        const plusCheck = validatePlusAliasing(localPart, domain);
        if (!plusCheck.valid) {
            return {
                allowed: false,
                domain,
                reason: plusCheck.reason
            };
        }

        // Check 2: Multiple periods in local part (all providers)
        const periodCheck = validateMultiplePeriods(localPart, domain);
        if (!periodCheck.valid) {
            return {
                allowed: false,
                domain,
                reason: periodCheck.reason
            };
        }

        // Check 3: Gibberish/random string detection
        const gibberishCheck = detectGibberish(localPart);
        if (gibberishCheck.suspicious) {
            return {
                allowed: false,
                domain,
                reason: gibberishCheck.reason
            };
        }

        return {
            allowed: true,
            domain,
            reason: 'Trusted email provider'
        };
    }

    return {
        allowed: false,
        domain,
        reason: `Email provider not supported. Please use a trusted provider like ${SUPPORTED_PROVIDERS.slice(0, 5).join(', ')}, or others.`
    };
}

/**
 * Check if a domain is in the allowlist
 *
 * @param {string} domain - The domain to check
 * @returns {boolean}
 */
function isDomainAllowed(domain) {
    if (!domain || typeof domain !== 'string') {
        return false;
    }
    return ALLOWED_DOMAINS.includes(domain.toLowerCase().trim());
}

module.exports = {
    validateEmailDomain,
    isDomainAllowed,
    ALLOWED_DOMAINS,
    SUPPORTED_PROVIDERS
};
