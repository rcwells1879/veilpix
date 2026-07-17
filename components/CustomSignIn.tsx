/**
 * Custom Sign In Component
 *
 * Replaces Clerk's modal sign-in with a custom form that normalizes emails
 * before calling Clerk's authentication API. This ensures users who signed up
 * with normalized emails can sign in with either the original or normalized format.
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useSignIn } from '@clerk/clerk-react';
import { normalizeEmail } from '../src/utils/emailNormalizer';

interface CustomSignInProps {
  onClose: () => void;
  onSwitchToSignUp: () => void;
}

type SignInView = 'sign-in' | 'request-code' | 'verify-code' | 'new-password';

function getClerkErrorMessage(error: any, fallback: string): string {
  const clerkErrors = error?.errors;

  if (Array.isArray(clerkErrors) && clerkErrors.length > 0) {
    return clerkErrors
      .map((clerkError: any) => clerkError.longMessage || clerkError.message)
      .filter(Boolean)
      .join(' ');
  }

  return fallback;
}

export function CustomSignIn({ onClose, onSwitchToSignUp }: CustomSignInProps) {
  const { signIn, isLoaded, setActive } = useSignIn();
  const [view, setView] = useState<SignInView>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isLoaded) return null;

  // OAuth sign-in (Google/GitHub)
  const handleOAuthSignIn = async (strategy: 'oauth_google' | 'oauth_github') => {
    try {
      await signIn!.authenticateWithRedirect({
        strategy,
        redirectUrl: '/veilpix/sso-callback',
        redirectUrlComplete: '/veilpix/',
      });
    } catch (err: any) {
      setError(getClerkErrorMessage(err, 'OAuth sign-in failed'));
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
      const result = await signIn!.create({
        identifier: normalizedEmail,
        password,
      });

      if (result.status === 'complete') {
        await setActive!({ session: result.createdSessionId });
        window.location.href = '/veilpix/';
      } else {
        setError('Additional verification is required. Please try another sign-in method.');
      }
    } catch (err: any) {
      setError(getClerkErrorMessage(err, 'Sign in failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const goToSignIn = () => {
    setView('sign-in');
    setPassword('');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
  };

  const goToRequestCode = () => {
    setView('request-code');
    setResetCode('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
  };

  const requestResetCode = async (isResend = false) => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setError('Enter the email address associated with your account.');
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);

    try {
      await signIn!.create({
        strategy: 'reset_password_email_code',
        identifier: normalizedEmail,
      });

      setView('verify-code');
      setNotice(isResend ? 'A new password reset code has been sent.' : 'Password reset code sent.');
    } catch (err: any) {
      setError(getClerkErrorMessage(err, 'We could not send a password reset code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleRequestResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    await requestResetCode();
  };

  const handleVerifyResetCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);

    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: resetCode.trim(),
      });

      if (result.status === 'needs_new_password') {
        setView('new-password');
      } else if (result.status === 'needs_second_factor') {
        setError('Additional verification is required before your password can be reset. Return to sign in and use another available method.');
      } else {
        setError('Password recovery could not continue. Please restart the reset process.');
      }
    } catch (err: any) {
      setError(getClerkErrorMessage(err, 'The code could not be verified. Check it and try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const result = await signIn!.resetPassword({
        password: newPassword,
        signOutOfOtherSessions: true,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive!({ session: result.createdSessionId });
        window.location.href = '/veilpix/';
      } else if (result.status === 'needs_second_factor') {
        setError('Your password was updated, but additional verification is required. Return to sign in and use another available method.');
      } else {
        setError('Your password could not be reset. Please restart the recovery process.');
      }
    } catch (err: any) {
      setError(getClerkErrorMessage(err, 'Your password could not be reset. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 overflow-y-auto py-8"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md shadow-2xl border border-gray-700/50 mx-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-xl font-semibold text-white">
            {view === 'sign-in' && 'Sign in'}
            {view === 'request-code' && 'Forgot password?'}
            {view === 'verify-code' && 'Check your email'}
            {view === 'new-password' && 'Choose a new password'}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-white transition-colors" aria-label="Close sign in">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          {view === 'sign-in' && 'Welcome back! Please sign in to continue.'}
          {view === 'request-code' && 'Enter your account email and we will send you a password reset code.'}
          {view === 'verify-code' && `Enter the code sent to ${email.trim()}.`}
          {view === 'new-password' && 'Create a new password for your account.'}
        </p>

        {notice && <p role="status" className="text-green-400 text-sm mb-4">{notice}</p>}
        {error && <p role="alert" className="text-red-400 text-sm mb-4">{error}</p>}

        {view === 'sign-in' && (
          <>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email address</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#E04F67] focus:ring-1 focus:ring-[#E04F67] focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#E04F67] focus:ring-1 focus:ring-[#E04F67] focus:outline-none transition-colors"
                />
                <div className="text-right mt-2">
                  <button type="button" onClick={goToRequestCode} className="text-sm text-[#E04F67] hover:text-[#DC2626] hover:underline transition-colors">
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-[#E04F67] hover:bg-[#DC2626] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? 'Signing in...' : 'Continue'}
                {!loading && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            </form>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-gray-700"></div>
              <span className="px-3 text-gray-500 text-sm">or</span>
              <div className="flex-1 border-t border-gray-700"></div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleOAuthSignIn('oauth_github')}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 border border-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                GitHub
              </button>
              <button
                type="button"
                onClick={() => handleOAuthSignIn('oauth_google')}
                className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 border border-gray-700 transition-colors"
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

            <p className="text-center text-gray-400 text-sm mt-4">
              Don&apos;t have an account?{' '}
              <button type="button" onClick={onSwitchToSignUp} className="text-[#E04F67] hover:text-[#DC2626] hover:underline transition-colors">
                Sign up
              </button>
            </p>
          </>
        )}

        {view === 'request-code' && (
          <form onSubmit={handleRequestResetCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email address</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your account email"
                required
                autoFocus
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#E04F67] focus:ring-1 focus:ring-[#E04F67] focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#E04F67] hover:bg-[#DC2626] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Sending code...' : 'Send password reset code'}
            </button>
            <button type="button" onClick={goToSignIn} disabled={loading} className="w-full text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              Back to sign in
            </button>
          </form>
        )}

        {view === 'verify-code' && (
          <form onSubmit={handleVerifyResetCode} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password reset code</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="Enter the code"
                required
                autoFocus
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#E04F67] focus:ring-1 focus:ring-[#E04F67] focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#E04F67] hover:bg-[#DC2626] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify code'}
            </button>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
              <button type="button" onClick={() => requestResetCode(true)} disabled={loading} className="text-[#E04F67] hover:text-[#DC2626] hover:underline disabled:opacity-50 transition-colors">
                Resend code
              </button>
              <button type="button" onClick={goToRequestCode} disabled={loading} className="text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
                Change email
              </button>
              <button type="button" onClick={goToSignIn} disabled={loading} className="text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {view === 'new-password' && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a new password"
                required
                autoFocus
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#E04F67] focus:ring-1 focus:ring-[#E04F67] focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Enter the new password again"
                required
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-[#E04F67] focus:ring-1 focus:ring-[#E04F67] focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#E04F67] hover:bg-[#DC2626] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {loading ? 'Resetting password...' : 'Reset password'}
            </button>
            <button type="button" onClick={goToSignIn} disabled={loading} className="w-full text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors">
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

export default CustomSignIn;
