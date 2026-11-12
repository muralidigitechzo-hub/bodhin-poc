/** Write / edit a review — bottom sheet (was a full screen in the design). */
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, reviews } from '@/api/client';
import { RATING_WORD, REVIEW_TAGS, type Course, type Review } from '@/core/catalog';
import { useAuth } from '@/store/auth';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Txt } from './Txt';
import { Button } from './Button';
import { BottomSheet, Chip } from './kit';
import { Banner } from './misc';

export function ReviewSheet({ course, open, onClose, onSaved }: { course: Course; open: boolean; onClose: () => void; onSaved: (r: Review) => void }) {
  const { c } = useTheme();
  const { session } = useAuth();
  const existing = session ? reviews.mine(session.user.id, course.id) : null;
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 0);
    setText(existing?.text ?? '');
    setTags(existing?.tags ?? []);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (!session) return;
    if (!rating) return setError('Tap the stars to rate the course.');
    setBusy(true);
    setError(null);
    try {
      const r = await reviews.submit({ courseId: course.id, userId: session.user.id, userName: shortName(session.user.name), rating: rating as Review['rating'], text, tags });
      onSaved(r);
      onClose();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={existing ? 'Edit your review' : 'Write a review'} footer={<Button title={existing ? 'Update review' : 'Submit review'} iconRight="send" loading={busy} style={{ flex: 1 }} onPress={submit} />}>
      <Txt color={c.inkSoft} numberOfLines={2}>
        {course.title}
      </Txt>
      {error && <Banner text={error} />}

      <View style={{ alignItems: 'center', gap: 6 }}>
        <View style={styles.stars} accessibilityRole="adjustable" accessibilityLabel={`Rating ${rating} of 5`}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Pressable key={s} onPress={() => { setRating(s); setError(null); }} hitSlop={4} accessibilityRole="button" accessibilityLabel={`${s} star${s > 1 ? 's' : ''}`} style={styles.star}>
              <Ionicons name={s <= rating ? 'star' : 'star-outline'} size={40} color={s <= rating ? '#F5A524' : c.borderStrong} />
            </Pressable>
          ))}
        </View>
        <Txt variant="bodyStrong" color={rating ? c.success : c.muted}>
          {rating ? RATING_WORD[rating] : 'Tap to rate'}
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <Txt variant="bodyStrong">Your review</Txt>
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.slice(0, 1000))}
          placeholder="What did you like? What could be better?"
          placeholderTextColor={c.muted}
          multiline
          accessibilityLabel="Your review"
          style={[styles.area, { borderColor: c.border, backgroundColor: c.surfaceMuted, color: c.ink }]}
        />
        <Txt variant="caption" color={c.muted} style={{ alignSelf: 'flex-end' }}>
          {text.length} / 1000
        </Txt>
      </View>

      <View style={{ gap: 10 }}>
        <Txt variant="bodyStrong">What did you like? (optional)</Txt>
        <View style={styles.tags}>
          {REVIEW_TAGS.map((t) => (
            <Chip key={t} label={t} icon={tags.includes(t) ? 'checkmark' : undefined} active={tags.includes(t)} onPress={() => setTags((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} />
          ))}
        </View>
      </View>
    </BottomSheet>
  );
}

const shortName = (n: string) => {
  const [a, b] = n.split(' ');
  return b ? `${a} ${b[0]}.` : a;
};

const styles = StyleSheet.create({
  stars: { flexDirection: 'row', gap: 4 },
  star: { padding: 4 },
  area: { minHeight: 120, borderWidth: 1.2, borderRadius: radius.md, padding: 14, fontSize: 16, textAlignVertical: 'top', outlineStyle: 'none' } as any,
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
