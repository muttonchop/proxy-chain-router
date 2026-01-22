import { describe, expect, it } from 'vitest';

import { matchesRoute, selectUpstream } from '../src/routing.js';
import type { RequestInfo, RouteRule } from '../src/types.js';

const baseInfo: RequestInfo = {
  connectionId: 1,
  hostname: 'sub.example.com',
  port: 443,
  isHttp: false,
  method: 'CONNECT',
  url: 'example.com:443',
  username: '',
  password: '',
};

describe('matchesRoute', () => {
  it('matches string domains for subdomains', () => {
    const route: RouteRule = {
      match: {
        domain: 'example.com',
      },
      upstream: 'http://proxy.local:8000',
    };

    expect(matchesRoute(route, baseInfo)).toBe(true);
  });

  it('matches regex domains', () => {
    const route: RouteRule = {
      match: {
        domain: /example\.com$/,
      },
      upstream: 'http://proxy.local:8000',
    };

    expect(matchesRoute(route, baseInfo)).toBe(true);
  });

  it('matches port and method constraints', () => {
    const route: RouteRule = {
      match: {
        port: [80, 443],
        method: ['CONNECT', 'GET'],
      },
      upstream: 'http://proxy.local:8000',
    };

    expect(matchesRoute(route, baseInfo)).toBe(true);
  });
});

describe('selectUpstream', () => {
  it('returns null for explicit direct routes', () => {
    const route: RouteRule = { upstream: null };
    const cursors = new Map<RouteRule, number>();
    expect(selectUpstream(route, cursors)).toBeNull();
  });

  it('round-robins across upstreams', () => {
    const route: RouteRule = {
      upstream: ['http://one', 'http://two'],
    };
    const cursors = new Map<RouteRule, number>();

    expect(selectUpstream(route, cursors)).toBe('http://one');
    expect(selectUpstream(route, cursors)).toBe('http://two');
    expect(selectUpstream(route, cursors)).toBe('http://one');
  });
});
