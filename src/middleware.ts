import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/signup'];

  // Check if the current route is public
  const isPublicRoute = publicRoutes.includes(pathname);

  // For Firebase auth, we'll let client-side handle redirects
  // since Firebase auth state is managed client-side
  // The middleware will only handle API route protection via Authorization headers

  // The demo route is public by design: it takes no input, runs against a
  // fixed document, and is rate limited. It is the only API route reachable
  // without a bearer token.
  if (pathname.startsWith('/api/demo/')) {
    return NextResponse.next();
  }

  // Only redirect to login for API routes that require auth
  if (pathname.startsWith('/api/') && !isPublicRoute) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};