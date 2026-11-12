/** Small cross-platform helpers for calendar links and files. */
import { Linking, Platform, Share } from 'react-native';

/** Opens a link in a new tab (web) or the system browser/app (native). */
export function openUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url).catch(() => {});
}

/** Web: downloads an .ics file. Native: shares the file contents so the user can pick a calendar app. */
export const saveIcs = (fileName: string, ics: string) => saveText(fileName, ics, 'text/calendar');

/** Web: downloads a text file. Native: shares the contents (or `fallbackMessage`) through the system share sheet. */
export async function saveText(fileName: string, content: string, mime: string, fallbackMessage?: string) {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ message: fallbackMessage ?? content, title: fileName });
}

export const whenLabel = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
