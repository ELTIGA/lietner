import { AuthApiError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { problemFor } from './session';

const apiError = (message: string, status: number, code: string) => new AuthApiError(message, status, code);

describe('problemFor', () => {
  it('asks to wait when a new code is requested within the minute', () => {
    const error = apiError('For security purposes, you can only request this after 59 seconds.', 429, 'over_email_send_rate_limit');
    expect(problemFor(error, true).problem).toBe('tooMany');
  });

  it('reports the email cap when the hourly limit is hit', () => {
    expect(problemFor(apiError('email rate limit exceeded', 429, 'over_email_send_rate_limit'), true).problem).toBe('emailCap');
  });

  it('reports the email cap when the provider refuses to send', () => {
    expect(problemFor(apiError('Error sending magic link email', 500, 'unexpected_failure'), true).problem).toBe('emailCap');
  });

  it('reports a wrong or expired code', () => {
    expect(problemFor(apiError('Token has expired or is invalid', 403, 'otp_expired'), false).problem).toBe('badCode');
  });
});
