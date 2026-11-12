/**
 * Camera / microphone access with errors a person can act on.
 * Browsers only show their "Allow" box while the site is still undecided. Once it was blocked (or the box was closed a few times)
 * Chrome never shows it again, and the person needs to be told exactly where to switch it back on.
 */
export type MediaKind = 'camera' | 'microphone' | 'screen';
type Perm = 'granted' | 'denied' | 'prompt' | 'unknown';

const ASK_TIMEOUT_MS = 25_000;

/** The browser's current decision for this site (Chrome and Edge can tell us; others answer 'unknown'). */
export async function permissionState(kind: Exclude<MediaKind, 'screen'>): Promise<Perm> {
  try {
    const q = (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: Perm }> } }).permissions;
    if (!q) return 'unknown';
    return (await q.query({ name: kind })).state;
  } catch {
    return 'unknown';
  }
}

const WHERE = 'Click the lock icon at the left of the address bar → set Camera and Microphone to Allow → then reload this page.';

/** Turn a browser media error into a short message that says what to do next. */
export async function explainMediaError(e: unknown, kind: MediaKind): Promise<Error> {
  const name = (e as { name?: string })?.name;
  const what = kind === 'microphone' ? 'microphone' : kind;
  if (kind === 'screen') {
    if (name === 'NotAllowedError' || name === 'AbortError') return new Error('Screen sharing was cancelled. Choose Share screen again and pick a window or screen.');
    return new Error('Could not start screen sharing in this browser.');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new Error(`No ${what} was found on this device. Plug one in and try again.`);
  if (name === 'NotReadableError') return new Error(`Your ${what} is being used by another app (Zoom, Teams, another tab…). Close it and try again.`);
  if (name === 'TimeoutError') return new Error(`The browser did not ask for ${what} permission. Look for a camera icon at the right end of the address bar, or ${WHERE.charAt(0).toLowerCase()}${WHERE.slice(1)}`);
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    const st = await permissionState(kind);
    if (st === 'denied') return new Error(`${what[0].toUpperCase()}${what.slice(1)} is blocked for this site, so the browser will not ask again. ${WHERE}`);
    if (st === 'prompt') return new Error(`You closed the permission box. Tap the button again and choose Allow.`);
    if (st === 'granted') return new Error(`The browser allows the ${what}, but your computer is blocking it. On Windows open Settings → Privacy & security → ${kind === 'camera' ? 'Camera' : 'Microphone'} and turn on access for desktop apps.`);
    return new Error(`Allow ${what} access: click Allow in the browser box. If no box appears, ${WHERE.charAt(0).toLowerCase()}${WHERE.slice(1)}`);
  }
  return new Error(`Could not start the ${what}.`);
}

/** getUserMedia that explains itself. Skips the pointless call when the site is already blocked, and never waits forever. */
export async function getUserMediaChecked(constraints: MediaStreamConstraints, kinds: Exclude<MediaKind, 'screen'>[]): Promise<MediaStream> {
  for (const k of kinds) {
    if ((await permissionState(k)) === 'denied') throw await explainMediaError({ name: 'NotAllowedError' }, k);
  }
  const first = kinds[0];
  try {
    return await Promise.race([
      navigator.mediaDevices.getUserMedia(constraints),
      new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), ASK_TIMEOUT_MS)),
    ]);
  } catch (e) {
    // with both camera and microphone requested, say which one is the problem when the browser tells us
    const which = (await permissionState('camera')) === 'denied' ? 'camera' : (await permissionState('microphone')) === 'denied' && kinds.includes('microphone') ? 'microphone' : first;
    throw await explainMediaError(e, which);
  }
}
