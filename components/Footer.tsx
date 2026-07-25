/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';

interface FooterProps {
  onShowPricing?: () => void;
}

interface FooterLink {
  name: string;
  href: string;
  external?: boolean;
}

const footerLinks: FooterLink[] = [
  { name: 'Examples', href: '#examples' },
  { name: 'FAQ', href: '#faq' },
  { name: 'VeilChat', href: 'https://veilstudio.io/veilchat/index.html', external: true },
  { name: 'Blog', href: 'https://veilstudio.io/veilpix/blog/', external: true },
  { name: 'Privacy', href: '/veilpix/privacy/' },
  { name: 'Terms', href: '/veilpix/terms/' },
  { name: 'Security', href: 'https://veilstudio.io/security/', external: true },
];

interface SocialIconProps {
  className?: string;
}

const GithubIcon: React.FC<SocialIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

const FacebookIcon: React.FC<SocialIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3" />
  </svg>
);

const LinkedinIcon: React.FC<SocialIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const GoogleIcon: React.FC<SocialIconProps> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const socialLinks = [
  { name: 'GitHub', icon: GithubIcon, href: 'https://github.com/rcwells1879/' },
  { name: 'Facebook', icon: FacebookIcon, href: 'https://www.facebook.com/profile.php?id=61580840610800' },
  { name: 'LinkedIn', icon: LinkedinIcon, href: 'https://www.linkedin.com/company/veilstudio1/' },
  { name: 'Google', icon: GoogleIcon, href: 'https://share.google/hOcx0JGyOS8D4FTqR' },
];

const Footer: React.FC<FooterProps> = ({ onShowPricing }) => (
  <footer className="site-footer text-gray-300" aria-label="VeilPix footer">
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-6 md:px-8">
      <div className="flex min-w-0 items-center justify-between gap-3 md:shrink-0 md:justify-start">
        <div className="flex min-w-0 items-center gap-2.5">
          <a href="https://veilstudio.io" className="shrink-0 text-sm font-semibold tracking-tight text-white transition hover:text-accent-200">
            <span className="text-accent-300">Veil</span>Studio
          </a>
          <span className="hidden text-[10px] text-gray-500 sm:inline">
            © {new Date().getFullYear()} All rights reserved.
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1" aria-label="VeilStudio social links">
          {socialLinks.map((item) => (
            <a
              key={item.name}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.name}
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition hover:bg-white/[0.07] hover:text-white"
            >
              <item.icon className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      </div>

      <nav className="flex min-w-0 flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] md:justify-end" aria-label="Footer navigation">
        {footerLinks.slice(0, 4).map((item) => (
          <a
            key={item.name}
            href={item.href}
            target={item.external ? '_blank' : undefined}
            rel={item.external ? 'noopener noreferrer' : undefined}
            className="shrink-0 transition hover:text-white"
          >
            {item.name}
          </a>
        ))}
        {onShowPricing && (
          <button type="button" onClick={onShowPricing} className="shrink-0 transition hover:text-white">
            Pricing
          </button>
        )}
        {footerLinks.slice(4).map((item) => (
          <a
            key={item.name}
            href={item.href}
            target={item.external ? '_blank' : undefined}
            rel={item.external ? 'noopener noreferrer' : undefined}
            className="shrink-0 transition hover:text-white"
          >
            {item.name}
          </a>
        ))}
      </nav>
    </div>
  </footer>
);

export default Footer;
