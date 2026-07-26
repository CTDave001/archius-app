import {
  findMostRecentActiveSession,
  findOnlyPendingSession,
  getClerkErrorMessage,
  isAlreadySignedInError,
  isCancelledClerkFlow,
} from '@/utils/clerkSession';
import { describe, expect, it } from '@jest/globals';

describe('Clerk session recovery helpers', () => {
  it('selects the most recently active session without mutating the list', () => {
    const sessions = [
      { id: 'pending', status: 'pending', lastActiveAt: new Date('2026-07-26T10:00:00Z') },
      { id: 'older', status: 'active', lastActiveAt: new Date('2026-07-25T10:00:00Z') },
      { id: 'newer', status: 'active', lastActiveAt: new Date('2026-07-26T09:00:00Z') },
    ] as const;

    expect(findMostRecentActiveSession(sessions)?.id).toBe('newer');
    expect(sessions.map((session) => session.id)).toEqual(['pending', 'older', 'newer']);
  });

  it('only returns a pending session when it is the sole local session', () => {
    expect(findOnlyPendingSession([{ id: 'pending', status: 'pending' }])?.id).toBe(
      'pending'
    );
    expect(
      findOnlyPendingSession([
        { id: 'pending', status: 'pending' },
        { id: 'active', status: 'active' },
      ])
    ).toBeUndefined();
  });

  it('recognizes duplicate sign-in errors at the top level and inside Clerk errors', () => {
    expect(
      isAlreadySignedInError({ code: 'api_response_error', message: "You're already signed in." })
    ).toBe(true);
    expect(
      isAlreadySignedInError({
        code: 'api_response_error',
        errors: [{ code: 'session_exists', longMessage: 'A session already exists.' }],
      })
    ).toBe(true);
    expect(isAlreadySignedInError({ code: 'form_password_incorrect' })).toBe(false);
  });

  it('uses Clerk detail messages without exposing a generic wrapper code', () => {
    const error = {
      code: 'api_response_error',
      message: 'Request failed',
      errors: [{ code: 'form_identifier_not_found', longMessage: 'No account was found.' }],
    };

    expect(getClerkErrorMessage(error, 'Try again.')).toBe('No account was found.');
    expect(isCancelledClerkFlow({ errors: [{ code: 'cancelled' }] })).toBe(true);
  });
});
