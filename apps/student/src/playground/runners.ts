/** Native (iOS/Android) build: in-browser runners are not available, so every stack runs on Bodhin's code server. */
import type { PFile, Stack } from './stacks';
import type { DomCheck } from './challenges';
import type { DomObservation } from './checks';
import type { RunResult } from './types';

export const browserCapable = (_s: Stack) => false;
export function stopAll() {}
export async function runInBrowser(_s: Stack, _f: PFile[], _stdin: string): Promise<RunResult> {
  return { stdout: '', stderr: 'This runs on the server on mobile.', ok: false, ms: 0 };
}
export function previewDoc(_s: Stack, _f: PFile[], _c?: DomCheck[]): { doc: string } | { error: string } {
  return { error: 'Live preview is available on the web version. Open thebodhin.com to build web pages.' };
}
export async function observeDom(_f: PFile[], _c: DomCheck[]): Promise<DomObservation[] | null> {
  return null;
}
export function compile(file: PFile) {
  return file.code;
}
