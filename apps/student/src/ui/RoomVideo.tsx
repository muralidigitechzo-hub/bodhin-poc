/** Renders a MediaStream (host camera / shared screen). Web: <video>. Native: wire @livekit/react-native VideoView (dev build). */
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

export function RoomVideo({ stream, muted = true, fit = 'cover', style }: { stream: MediaStream | null; muted?: boolean; fit?: 'cover' | 'contain'; style?: object }) {
  const ref = useRef<any>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    ref.current.srcObject = stream;
    if (stream) ref.current.play?.().catch(() => {});
  }, [stream]);
  if (Platform.OS !== 'web' || !stream) return <View style={style} />;
  return React.createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted,
    'aria-label': 'Instructor video',
    style: { width: '100%', height: '100%', objectFit: fit, background: '#000', ...(style as object) },
  });
}
