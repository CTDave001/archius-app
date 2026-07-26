type ClerkSessionLike = {
  id: string;
  status?: string | null;
  lastActiveAt?: Date | string | number | null;
};

type ClerkErrorLike = {
  code?: unknown;
  message?: unknown;
  longMessage?: unknown;
  errors?: unknown;
};

const dateValue = (value: ClerkSessionLike['lastActiveAt']): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

export const findMostRecentActiveSession = <T extends ClerkSessionLike>(
  sessions: readonly T[] | undefined
): T | undefined =>
  sessions
    ?.filter((session) => session.status === 'active')
    .reduce<T | undefined>((latest, session) => {
      if (!latest) return session;
      return dateValue(session.lastActiveAt) > dateValue(latest.lastActiveAt) ? session : latest;
    }, undefined);

export const findOnlyPendingSession = <T extends ClerkSessionLike>(
  sessions: readonly T[] | undefined
): T | undefined => {
  if (sessions?.length !== 1 || sessions[0].status !== 'pending') return undefined;
  return sessions[0];
};

const errorParts = (error: unknown): ClerkErrorLike[] => {
  if (!error || typeof error !== 'object') return [];

  const topLevel = error as ClerkErrorLike;
  const nested = Array.isArray(topLevel.errors)
    ? topLevel.errors.filter(
        (entry): entry is ClerkErrorLike => !!entry && typeof entry === 'object'
      )
    : [];

  return [topLevel, ...nested];
};

export const isAlreadySignedInError = (error: unknown): boolean => {
  const knownCodes = new Set([
    'already_signed_in',
    'session_already_exists',
    'session_exists',
  ]);

  return errorParts(error).some((part) => {
    const code = typeof part.code === 'string' ? part.code.toLowerCase() : '';
    const message =
      typeof part.longMessage === 'string'
        ? part.longMessage
        : typeof part.message === 'string'
          ? part.message
          : '';

    return knownCodes.has(code) || /already signed in/i.test(message);
  });
};

export const isCancelledClerkFlow = (error: unknown): boolean =>
  errorParts(error).some((part) => {
    const code = typeof part.code === 'string' ? part.code.toLowerCase() : '';
    return code === 'cancelled' || code === 'canceled';
  });

export const getClerkErrorMessage = (error: unknown, fallback: string): string => {
  for (const part of errorParts(error).reverse()) {
    const message =
      typeof part.longMessage === 'string'
        ? part.longMessage
        : typeof part.message === 'string'
          ? part.message
          : '';
    if (message.trim()) return message;
  }

  return fallback;
};
