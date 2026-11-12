/** Form validation shared by app and web. Returns an error message or null. */
export const v = {
  name: (s: string) => (s.trim().length < 2 ? 'Enter your full name.' : null),
  email: (s: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim()) ? null : 'Enter a valid email address.'),
  /** Indian mobile: 10 digits starting 6–9. */
  phoneIN: (s: string) => (/^[6-9]\d{9}$/.test(s.replace(/\D/g, '')) ? null : 'Enter a valid 10-digit mobile number.'),
  identifier: (s: string) => {
    const t = s.trim();
    if (!t) return 'Enter your email or mobile number.';
    if (t.includes('@')) return v.email(t);
    return v.phoneIN(t.slice(-10)) ? 'Enter a valid email or 10-digit mobile number.' : null;
  },
  password: (s: string) => (s.length < 8 ? 'Use at least 8 characters.' : !/[A-Za-z]/.test(s) || !/\d/.test(s) ? 'Use letters and numbers.' : null),
  required: (s: string, what = 'This field') => (s ? null : `${what} is required.`),
};

/** 0–3 strength score for the password meter. */
export function passwordStrength(s: string): 0 | 1 | 2 | 3 {
  let score = 0;
  if (s.length >= 8) score++;
  if (/[A-Za-z]/.test(s) && /\d/.test(s)) score++;
  if (s.length >= 12 || /[^A-Za-z0-9]/.test(s)) score++;
  return score as 0 | 1 | 2 | 3;
}
