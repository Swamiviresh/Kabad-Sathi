import { NextRequest, NextResponse } from 'next/server';
import { createUser, findUserByEmail, publicUser } from '../../../../lib/localdb';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { name, email, password, phone, role, rewardsOptIn } = await req.json().catch(() => ({}));

  if (!name || !email || !password || !phone) {
    return NextResponse.json({ error: 'Please fill in name, email, password and phone number.' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }
  if (role && !['customer', 'collector'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 });
  }
  if (findUserByEmail(email)) {
    return NextResponse.json(
      { error: 'This email is already registered. Please log in instead.' },
      { status: 409 },
    );
  }

  const user = createUser({
    name,
    email,
    password,
    phone,
    role: role || 'customer',
    rewardsOptIn: Boolean(rewardsOptIn),
  });
  return NextResponse.json({ user: publicUser(user) });
}
