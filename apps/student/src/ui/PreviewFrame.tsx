import React from 'react';
import { View } from 'react-native';
import { Txt } from './Txt';

export function PreviewFrame({ height = 120 }: { doc: string; title: string; height?: number }) {
  return (
    <View style={{ height, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <Txt center>Live preview is available on the web version of Bodhin.</Txt>
    </View>
  );
}
