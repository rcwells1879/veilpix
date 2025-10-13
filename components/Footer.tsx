/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';

interface FooterProps {
  onShowPricing?: () => void;
}

const footerLinks = {
  product: [
    { name: 'Features', href: '#features' },
    { name: 'Apps', href: 'https://veilstudio.io/veilchat/index.html' },
    { name: 'Pricing', onClick: 'pricing' }, // Special marker for pricing
    { name: 'Documentation', href: '#docs' },
  ],
  company: [
    { name: 'About', href: 'https://veilstudio.io/security/' },
    { name: 'Blog', href: 'https://veilstudio.io/veilpix/blog/' },
    { name: 'Careers', href: '#careers' },
    { name: 'Contact', href: '#contact' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '#privacy' },
    { name: 'Terms of Service', href: '#terms' },
    { name: 'Security', href: '/security' },
  ],
};

// Social Media Icons
const GithubIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

const FacebookIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
  </svg>
);

const LinkedinIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
    <rect x="2" y="9" width="4" height="12"></rect>
    <circle cx="4" cy="4" r="2"></circle>
  </svg>
);

const GoogleIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

const socialLinks = [
  { name: 'GitHub', icon: GithubIcon, href: 'https://github.com/rcwells1879/' },
  { name: 'Facebook', icon: FacebookIcon, href: 'https://www.facebook.com/profile.php?id=61580840610800' },
  { name: 'LinkedIn', icon: LinkedinIcon, href: 'https://www.linkedin.com/company/veilstudio1/' },
  { name: 'Google', icon: GoogleIcon, href: 'https://share.google/hOcx0JGyOS8D4FTqR' },
];

const Footer: React.FC<FooterProps> = ({ onShowPricing }) => {
  return (
    <footer className="bg-gray-800/30 backdrop-blur-sm border-t border-gray-700">
      <div className="max-w-[1600px] mx-auto px-4 md:px-8">
        <div className="py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2">
              <a href="https://veilstudio.io" className="text-2xl font-bold inline-block">
                <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Veil</span>
                <span className="text-white">Studio</span>
              </a>
              <p className="mt-4 text-gray-300 max-w-md">
                Developing powerful, beautiful AI-integrated applications with privacy and security as core principles.
              </p>
              <div className="flex space-x-6 mt-6">
                {socialLinks.map((item) => (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors duration-300"
                  >
                    <span className="sr-only">{item.name}</span>
                    <item.icon size={24} />
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Product
              </h3>
              <ul className="space-y-3">
                {footerLinks.product.map((item) => (
                  <li key={item.name}>
                    {'onClick' in item && item.onClick === 'pricing' && onShowPricing ? (
                      <button
                        onClick={onShowPricing}
                        className="text-gray-300 hover:text-white transition-colors duration-300 text-left"
                      >
                        {item.name}
                      </button>
                    ) : (
                      <a
                        href={'href' in item ? item.href : '#'}
                        className="text-gray-300 hover:text-white transition-colors duration-300"
                      >
                        {item.name}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Company
              </h3>
              <ul className="space-y-3">
                {footerLinks.company.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      className="text-gray-300 hover:text-white transition-colors duration-300"
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Legal
              </h3>
              <ul className="space-y-3">
                {footerLinks.legal.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      className="text-gray-300 hover:text-white transition-colors duration-300"
                    >
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800">
            <p className="text-center text-gray-400">
              © {new Date().getFullYear()} <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Veil</span><span className="text-white">Studio</span>. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
