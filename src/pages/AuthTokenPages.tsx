import React, { useEffect, useState } from 'react';
import { completePasswordReset, verifyStaffEmail } from '../lib/api';
import { Link, useRouter } from '../lib/router';

export function VerifyEmailPage() {
  const { search } = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your staff email…');

  useEffect(() => {
    const token = new URLSearchParams(search).get('token') || '';
    if (!token) {
      setStatus('error');
      setMessage('Verification token is missing from the link.');
      return;
    }

    let cancelled = false;
    verifyStaffEmail(token)
      .then((res) => {
        if (!cancelled) {
          setStatus('success');
          setMessage(`${res.email} is now verified. You can sign in to the staff dashboard.`);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Verification failed.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [search]);

  return (
    <main className="mx-auto max-w-md px-4 py-20 sm:px-6">
      <div className="border border-[#ded5c8] bg-[#fcf9f5] p-8">
        <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
          Staff Verification
        </p>
        <h1 className="mt-2 font-serif text-3xl font-normal text-[#1c1917]">
          {status === 'loading' && 'Checking Link'}
          {status === 'success' && 'Email Verified'}
          {status === 'error' && 'Link Expired'}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#57534e]">{message}</p>
        <div className="mt-6">
          <Link
            to="/admin"
            className="inline-block bg-[#1c1917] px-5 py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
          >
            Go to Staff Sign In
          </Link>
        </div>
      </div>
    </main>
  );
}

export function ResetPasswordPage() {
  const { search } = useRouter();
  const token = new URLSearchParams(search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Reset token is missing from this URL.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-md px-4 py-20 sm:px-6">
      <div className="border border-[#ded5c8] bg-[#fcf9f5] p-8">
        <p className="text-xs font-medium tracking-[0.18em] uppercase text-[#78716c]">
          Password Reset
        </p>
        <h1 className="mt-2 font-serif text-3xl font-normal text-[#1c1917]">
          {done ? 'Password Updated' : 'Set a New Password'}
        </h1>

        {done ? (
          <>
            <p className="mt-3 text-sm text-[#57534e]">
              Your staff password has been updated and prior sessions have been signed out.
            </p>
            <Link
              to="/admin"
              className="mt-6 inline-block bg-[#1c1917] px-5 py-2.5 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c]"
            >
              Sign In to Admin
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && (
              <div className="border border-[#991b1b]/30 bg-[#fef2f2] px-3.5 py-2.5 text-xs text-[#991b1b]">
                {error}
              </div>
            )}
            <div>
              <label
                htmlFor="reset-pw"
                className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
              >
                New Password
              </label>
              <input
                id="reset-pw"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="reset-pw-confirm"
                className="block text-xs font-medium tracking-wider uppercase text-[#78716c]"
              >
                Confirm Password
              </label>
              <input
                id="reset-pw-confirm"
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1.5 w-full border border-[#ded5c8] bg-[#f6f1ea] px-3 py-2.5 text-sm text-[#1c1917] focus:border-[#1c1917] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer bg-[#1c1917] py-3 text-xs font-medium tracking-wider uppercase text-[#f6f1ea] hover:bg-[#352f2c] disabled:opacity-60"
            >
              {submitting ? 'Updating…' : 'Save New Password'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
