/** Code editor (native): plain monospace multiline input. (Web uses CodeMirror — see CodeEditor.web.tsx.) */
import React from 'react';
import { Platform, TextInput } from 'react-native';
import type { CmLang } from '@/playground/stacks';

export function CodeEditor({ value, onChange, label, readOnly, minHeight = 280 }: { value: string; onChange: (v: string) => void; lang: CmLang; label: string; readOnly?: boolean; minHeight?: number }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      multiline
      editable={!readOnly}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      accessibilityLabel={label}
      textAlignVertical="top"
      style={{ minHeight, backgroundColor: '#282c34', color: '#e6e6e6', borderRadius: 12, padding: 12, fontSize: 14, lineHeight: 20, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) }}
    />
  );
}
