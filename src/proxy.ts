import { NextResponse } from 'next/server';

export async function proxy() {
  // Middleware disabled to prevent webhook interference
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
