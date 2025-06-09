import { NextResponse } from 'next/server';

export async function middleware() {
  // All the complex logic is commented out for now
  // You can uncomment specific parts as needed
  
  return NextResponse.next(); // Allow all requests for now
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/webhook (WhatsApp webhook endpoint)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhook|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
