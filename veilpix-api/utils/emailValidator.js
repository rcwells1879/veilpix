/**
 * Email Domain Allowlist Validator
 *
 * Only allows email domains from trusted providers that require identity
 * verification (phone/SMS verification or equivalent barriers).
 *
 * This prevents abuse from burner/disposable email addresses.
 * Also detects Gmail aliasing tricks (dots, plus signs) used to create
 * multiple accounts from a single Gmail address.
 */

// Gmail domains that support aliasing (dots and plus signs are ignored)
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'];

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
 * Validate Gmail addresses for aliasing tricks
 * Gmail ignores dots and plus signs, allowing users to create unlimited aliases
 * from a single account (e.g., john.doe@gmail.com = johndoe@gmail.com)
 *
 * @param {string} localPart - The part before @ in the email
 * @param {string} domain - The email domain
 * @returns {{ valid: boolean, reason: string|null }}
 */
function validateGmailAliasing(localPart, domain) {
    // Only check Gmail domains
    if (!GMAIL_DOMAINS.includes(domain)) {
        return { valid: true, reason: null };
    }

    // Check for plus sign (e.g., john+spam@gmail.com)
    if (localPart.includes('+')) {
        return {
            valid: false,
            reason: 'Gmail addresses with + symbols are not supported. Please use your standard Gmail address without the + portion.'
        };
    }

    // Count periods in local part (allow 1, block 2+)
    const periodCount = (localPart.match(/\./g) || []).length;
    if (periodCount >= 2) {
        return {
            valid: false,
            reason: 'Gmail addresses with multiple periods are not supported. Please use your standard Gmail address.'
        };
    }

    return { valid: true, reason: null };
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
        // Check for Gmail aliasing tricks (dots, plus signs)
        const gmailCheck = validateGmailAliasing(localPart, domain);
        if (!gmailCheck.valid) {
            return {
                allowed: false,
                domain,
                reason: gmailCheck.reason
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
