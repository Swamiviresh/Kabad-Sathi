import { NextRequest, NextResponse } from 'next/server';
import { publicUser, verifyLogin } from '../../../../lib/localdb';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json({ error: 'Please enter email and password.' }, { status: 400 });
  }

  const { user, error } = verifyLogin(email, password);
  if (error || !user) {
    // 404 = not registered, 401 = wrong password — distinct errors as required
    const status = error && error.startsWith('No account') ? 404 : 401;
    return NextResponse.json({ error: error || 'Login failed.' }, { status });
  }

  return NextResponse.json({ user: publicUser(user) });
}
