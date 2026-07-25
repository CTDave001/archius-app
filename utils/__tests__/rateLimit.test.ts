import { recordReviewSignInAttempt } from '@/utils/rateLimit';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

describe('App Review sign-in rate limit', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('blocks the sixth attempt for a client within fifteen minutes', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00Z'));
    const key = 'test-client-sixth-attempt';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(recordReviewSignInAttempt(key)).toEqual({ ok: true });
    }

    expect(recordReviewSignInAttempt(key)).toEqual({
      ok: false,
      retryAfterSeconds: 900,
    });
  });

  it('allows attempts again after the rolling window expires', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-25T12:00:00Z'));
    const key = 'test-client-window-reset';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      recordReviewSignInAttempt(key);
    }
    jest.setSystemTime(new Date('2026-07-25T12:15:01Z'));

    expect(recordReviewSignInAttempt(key)).toEqual({ ok: true });
  });
});
