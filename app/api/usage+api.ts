import { getUsage } from '@/utils/rateLimit';
import { authenticate } from '@/utils/serverAuth';

export async function GET(req: Request) {
  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { used, limit } = getUsage(user.userId, 'flash', user.isPro);
  return new Response(JSON.stringify({ used, limit, isPro: user.isPro }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
