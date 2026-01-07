# Plan: Email Normalization BEFORE Clerk Authentication

## Problem
Burner email services give users addresses like `j.o.h.n12343@gmail.com`. These services intercept emails at that EXACT address pattern. If we normalize the email to `john12343@gmail.com` before Clerk sends the auth link, the burner service won't receive it - but real Gmail users will (because Gmail ignores dots).

## Solution: Custom Signup Form with Pre-Normalization

Replace Clerk's modal signup with a custom form that normalizes emails before calling Clerk's authentication API.

---

## How It Works

1. User enters `j.o.h.n12343@gmail.com` in custom signup form
2. Frontend normalizes to `john12343@gmail.com`
3. Clerk sends auth link to `john12343@gmail.com`
4. **Burner service** → Doesn't receive (looking for exact `j.o.h.n12343@gmail.com`)
5. **Real Gmail user** → Receives email (Gmail treats both as same mailbox)

---

## Implementation

### Step 1: Create Email Normalizer (Frontend)

**File:** `/src/utils/emailNormalizer.ts`

```typescript
/**
 * Normalize email addresses to break burner email services.
 * Gmail ignores dots, but burner services don't.
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

export function normalizeEmail(email: string): string {
  if (!email) return '';

  const emailLower = email.toLowerCase().trim();
  const atIndex = emailLower.lastIndexOf('@');

  if (atIndex === -1) return emailLower;

  let localPart = emailLower.substring(0, atIndex);
  const domain = emailLower.substring(atIndex + 1);

  // Strip plus aliases (user+anything → user)
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
```

---

### Step 2: Create Custom Signup Component

**File:** `/src/components/CustomSignUp.tsx`

Replace Clerk's modal with a custom form matching the existing design. Includes:
- Email + Password fields
- Google and GitHub OAuth buttons
- Email normalization before Clerk API call
- Dark theme styling

```tsx
import { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { normalizeEmail } from '../utils/emailNormalizer';

interface CustomSignUpProps {
  onClose: () => void;
  onSwitchToSignIn: () => void;
}

export function CustomSignUp({ onClose, onSwitchToSignIn }: CustomSignUpProps) {
  const { signUp, isLoaded, setActive } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoaded) return null;

  // OAuth signup (Google/GitHub) - no email normalization needed
  const handleOAuthSignUp = async (strategy: 'oauth_google' | 'oauth_github') => {
    try {
      await signUp.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/veilpix/',
      });
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'OAuth signup failed');
    }
  };

  // Email/password signup - NORMALIZE EMAIL
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // NORMALIZE EMAIL BEFORE SENDING TO CLERK
    const normalizedEmail = normalizeEmail(email);

    try {
      await signUp.create({
        emailAddress: normalizedEmail,
        password,
      });

      // Send verification email
      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      setPendingVerification(true);
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        window.location.href = '/veilpix/';
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Verification code screen
  if (pendingVerification) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Verify your email</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <p className="text-gray-400 mb-4">
            We sent a verification code to {normalizeEmail(email)}
          </p>
          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter verification code"
              className="w-full px-4 py-3 bg-[#252542] border border-gray-700 rounded-lg text-white"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#e63946] hover:bg-[#d62836] text-white rounded-lg font-medium"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main signup form
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-white">Create your account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <p className="text-gray-400 text-sm mb-6">Welcome! Please fill in the details to get started.</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-4 py-3 bg-[#252542] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#e63946] focus:outline-none"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="w-full px-4 py-3 bg-[#252542] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#e63946] focus:outline-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Continue Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#e63946] hover:bg-[#d62836] text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            {loading ? 'Creating account...' : 'Continue'} <span>▸</span>
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-gray-700"></div>
          <span className="px-3 text-gray-500 text-sm">or</span>
          <div className="flex-1 border-t border-gray-700"></div>
        </div>

        {/* OAuth Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleOAuthSignUp('oauth_github')}
            className="flex-1 py-3 bg-[#252542] hover:bg-[#2f2f4a] text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </button>
          <button
            onClick={() => handleOAuthSignUp('oauth_google')}
            className="flex-1 py-3 bg-[#252542] hover:bg-[#2f2f4a] text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
        </div>

        {/* Switch to Sign In */}
        <p className="text-center text-gray-400 text-sm mt-4">
          Already have an account?{' '}
          <button onClick={onSwitchToSignIn} className="text-[#e63946] hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
```

---

### Step 3: Create Custom Sign-In Component

**File:** `/src/components/CustomSignIn.tsx`

```tsx
import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { normalizeEmail } from '../utils/emailNormalizer';

interface CustomSignInProps {
  onClose: () => void;
  onSwitchToSignUp: () => void;
}

export function CustomSignIn({ onClose, onSwitchToSignUp }: CustomSignInProps) {
  const { signIn, isLoaded, setActive } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoaded) return null;

  // OAuth sign-in (Google/GitHub)
  const handleOAuthSignIn = async (strategy: 'oauth_google' | 'oauth_github') => {
    try {
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/veilpix/',
      });
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'OAuth sign-in failed');
    }
  };

  // Email/password sign-in - NORMALIZE EMAIL
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // NORMALIZE EMAIL BEFORE SENDING TO CLERK
    const normalizedEmail = normalizeEmail(email);

    try {
      const result = await signIn.create({
        identifier: normalizedEmail,
        password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        window.location.href = '/veilpix/';
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-xl p-6 w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-white">Sign in</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
        <p className="text-gray-400 text-sm mb-6">Welcome back! Please sign in to continue.</p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="w-full px-4 py-3 bg-[#252542] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#e63946] focus:outline-none"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              className="w-full px-4 py-3 bg-[#252542] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#e63946] focus:outline-none"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Continue Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#e63946] hover:bg-[#d62836] text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            {loading ? 'Signing in...' : 'Continue'} <span>▸</span>
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center my-4">
          <div className="flex-1 border-t border-gray-700"></div>
          <span className="px-3 text-gray-500 text-sm">or</span>
          <div className="flex-1 border-t border-gray-700"></div>
        </div>

        {/* OAuth Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleOAuthSignIn('oauth_github')}
            className="flex-1 py-3 bg-[#252542] hover:bg-[#2f2f4a] text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </button>
          <button
            onClick={() => handleOAuthSignIn('oauth_google')}
            className="flex-1 py-3 bg-[#252542] hover:bg-[#2f2f4a] text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>
        </div>

        {/* Switch to Sign Up */}
        <p className="text-center text-gray-400 text-sm mt-4">
          Don't have an account?{' '}
          <button onClick={onSwitchToSignUp} className="text-[#e63946] hover:underline">
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
}
```

---

### Step 4: Create SSO Callback Page

**File:** `/src/pages/SSOCallback.tsx`

Required for OAuth redirects to complete:

```tsx
import { AuthenticateWithRedirectCallback } from '@clerk/clerk-react';

export function SSOCallback() {
  return <AuthenticateWithRedirectCallback />;
}
```

Add route in your router:
```tsx
<Route path="/sso-callback" element={<SSOCallback />} />
```

---

### Step 5: Update AuthButton Component

**File:** `/components/AuthButton.tsx`

Replace Clerk's modal buttons with custom components:

```tsx
// Before: Using Clerk's modal
<SignUpButton mode="modal">
  <button>Sign Up</button>
</SignUpButton>

// After: Using custom modal with our form
<button onClick={() => setShowSignUp(true)}>Sign Up</button>
{showSignUp && <CustomSignUpModal onClose={() => setShowSignUp(false)} />}
```

---

### Step 6: Also Normalize in Backend (Defense in Depth)

**File:** `/veilpix-api/utils/database.js`

Still store normalized email in Supabase as a secondary check:

```javascript
const { normalizeEmail } = require('./emailNormalizer');

async createOrGetUser(clerkUserId, email) {
  const normalizedEmail = normalizeEmail(email);

  // Store both original and normalized
  const { data: newUser } = await supabase
    .from('users')
    .upsert({
      clerk_user_id: clerkUserId,
      email: email,
      normalized_email: normalizedEmail,
      // ... rest of fields
    });
}
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/emailNormalizer.ts` | **CREATE** | Frontend email normalization |
| `src/components/CustomSignUp.tsx` | **CREATE** | Custom signup form with OAuth |
| `src/components/CustomSignIn.tsx` | **CREATE** | Custom sign-in form with OAuth |
| `src/pages/SSOCallback.tsx` | **CREATE** | OAuth redirect handler |
| `components/AuthButton.tsx` | **MODIFY** | Replace Clerk modal with custom |
| `src/App.tsx` or router | **MODIFY** | Add /sso-callback route |
| `veilpix-api/utils/emailNormalizer.js` | **CREATE** | Backend normalization (copy) |
| `veilpix-api/utils/database.js` | **MODIFY** | Store normalized_email (optional)|

---

## Expected Outcome

### Burner Email Service User:
1. Enters `j.o.h.n12343@gmail.com`
2. Form normalizes to `john12343@gmail.com`
3. Clerk sends auth email to `john12343@gmail.com`
4. Burner service looking for `j.o.h.n12343@gmail.com` → **NEVER RECEIVES IT**
5. User can't complete signup ✅

### Legitimate Gmail User:
1. Enters `john.doe@gmail.com`
2. Form normalizes to `johndoe@gmail.com`
3. Clerk sends auth email to `johndoe@gmail.com`
4. Gmail delivers to `john.doe@gmail.com` (Gmail ignores dots)
5. User receives email and completes signup ✅

---

## Styling Note

The custom forms match your existing dark theme with:
- Background: `#1a1a2e`
- Input fields: `#252542`
- Primary button: `#e63946`
- Border: `border-gray-700`
