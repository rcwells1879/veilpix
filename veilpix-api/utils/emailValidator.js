/**
 * Email Domain Allowlist Validator
 *
 * Only allows email domains from trusted providers that require identity
 * verification (phone/SMS verification or equivalent barriers).
 *
 * This prevents abuse from burner/disposable email addresses.
 */

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

    const domain = emailLower.substring(atIndex + 1);

    if (ALLOWED_DOMAINS.includes(domain)) {
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
