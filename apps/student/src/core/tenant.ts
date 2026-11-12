/**
 * Tenant resolution from hostname.
 *  thebodhin.com / www / app        → Bodhin marketplace (no tenant)
 *  rajesh.thebodhin.com             → tenant slug "rajesh"
 *  learn.rajeshacademy.com          → custom-domain lookup (server-side in production)
 * SECURITY: in production the server resolves the tenant; the client value is only for UI theming.
 */
export const ROOT_DOMAIN = 'thebodhin.com';
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'cdn', 'static']);

export type HostResolution =
  | { kind: 'platform' }
  | { kind: 'subdomain'; slug: string }
  | { kind: 'custom'; host: string };

export function resolveHost(hostname: string): HostResolution {
  const host = hostname.toLowerCase().replace(/:\d+$/, '');
  if (host === ROOT_DOMAIN || host === 'localhost' || host.endsWith('.claude.ai') || host.endsWith('.claudeusercontent.com')) return { kind: 'platform' };
  if (host.endsWith('.' + ROOT_DOMAIN)) {
    const slug = host.slice(0, -(ROOT_DOMAIN.length + 1));
    return RESERVED.has(slug) ? { kind: 'platform' } : { kind: 'subdomain', slug };
  }
  return { kind: 'custom', host };
}

export const tenantUrl = (slug: string) => `https://${slug}.${ROOT_DOMAIN}`;
