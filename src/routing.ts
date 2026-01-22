import type { RequestInfo, RouteMatch, RouteRule } from './types.js';

const DEFAULT_METHOD = 'CONNECT';

export function normalizeMethod(method: string | undefined): string {
  return (method || DEFAULT_METHOD).toUpperCase();
}

export function matchesRoute(route: RouteRule, info: RequestInfo): boolean {
  if (!route.match) {
    return true;
  }

  const match = route.match;

  if (match.domain && !matchesDomain(info.hostname, match.domain)) {
    return false;
  }

  if (match.hostname && !matchesDomain(info.hostname, match.hostname)) {
    return false;
  }

  if (match.port !== undefined && !matchesPort(info.port, match.port)) {
    return false;
  }

  if (match.isHttp !== undefined && match.isHttp !== info.isHttp) {
    return false;
  }

  if (match.method !== undefined && !matchesMethod(info.method, match.method)) {
    return false;
  }

  return true;
}

export function selectRoute(routes: RouteRule[] | undefined, info: RequestInfo): RouteRule | undefined {
  if (!routes || routes.length === 0) {
    return undefined;
  }

  for (const route of routes) {
    if (matchesRoute(route, info)) {
      return route;
    }
  }

  return undefined;
}

export function selectUpstream(
  route: RouteRule | undefined,
  cursors: Map<RouteRule, number>,
): string | null | undefined {
  if (!route || route.upstream === undefined) {
    return undefined;
  }

  if (route.upstream === null) {
    return null;
  }

  const upstreams = Array.isArray(route.upstream) ? route.upstream : [route.upstream];

  if (upstreams.length === 0) {
    return null;
  }

  if (upstreams.length === 1) {
    return upstreams[0];
  }

  const current = cursors.get(route) ?? 0;
  const nextIndex = current % upstreams.length;
  cursors.set(route, (current + 1) % upstreams.length);
  return upstreams[nextIndex];
}

function matchesDomain(hostname: string, matcher: RouteMatch['domain']): boolean {
  if (!matcher) {
    return true;
  }

  if (typeof matcher === 'string') {
    const normalizedHost = hostname.toLowerCase();
    const normalizedMatcher = matcher.toLowerCase();
    return normalizedHost === normalizedMatcher || normalizedHost.endsWith(`.${normalizedMatcher}`);
  }

  return testRegex(matcher, hostname);
}

function matchesPort(port: number, matcher: RouteMatch['port']): boolean {
  if (matcher === undefined) {
    return true;
  }

  if (Array.isArray(matcher)) {
    return matcher.includes(port);
  }

  return matcher === port;
}

function matchesMethod(method: string, matcher: RouteMatch['method']): boolean {
  if (matcher === undefined) {
    return true;
  }

  const normalizedMethod = normalizeMethod(method);

  if (Array.isArray(matcher)) {
    return matcher.map(normalizeMethod).includes(normalizedMethod);
  }

  return normalizeMethod(matcher) === normalizedMethod;
}

function testRegex(regex: RegExp, value: string): boolean {
  if (regex.global || regex.sticky) {
    regex.lastIndex = 0;
  }

  return regex.test(value);
}
