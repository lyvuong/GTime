import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChordPro } from './chordParser.ts';
import { songTiming } from './songTiming.ts';
import { buildSongPhrase } from './songPhrase.ts';
import { addDrums } from './drums.ts';
import { addBass, songSegments } from './bass.ts';
import { PATTERNS } from './patterns.ts';
import { pickVariant, variantsFor } from './fillVariants.ts';

const SONG = `{title: t}
{key: C}

{start_of_verse}
[C]la la la la la la la [Am]la la la la la la la
[F]la la la la la la la [G]la la la la la la la
[C]la la la la la la la [Am]la la la la la la la
[F]la la la la la la la [G]la la la la la la la
{end_of_verse}

{start_of_chorus}
[F]la la la la la la la [G]la la la la la la la
[Em]la la la la la la la [Am]la la la la la la la
[Dm]la la la la la la la [G]la la la la la la la
[C]la la la la la la la [C]la la la la la la la
{end_of_chorus}
`;

const timing = songTiming(parseChordPro(SONG));
const pattern = (id: string) => PATTERNS.find((p) => p.id === id)!;

test('every rhythm has small and big fills', () => {
  for (const p of PATTERNS) {
    const v = variantsFor(p);
    assert.ok(v.some((x) => x.size === 'small') && v.some((x) => x.size === 'big'), p.id);
    assert.equal(new Set(v.map((x) => x.id)).size, v.length, `${p.id} has distinct fills`);
  }
});

test('the choice of fill is the same every time, and never repeats the one before', () => {
  const p = pattern('rumba');
  const a = pickVariant(p, 'small', 'C', 'G', 3, null);
  assert.equal(pickVariant(p, 'small', 'C', 'G', 3, null).id, a.id);
  assert.notEqual(pickVariant(p, 'small', 'C', 'G', 3, a.id).id, a.id);
  const seen = new Set<string>();
  for (let bar = 0; bar < 40; bar++) seen.add(pickVariant(p, 'small', ['C', 'F', 'G', 'Am'][bar % 4], ['F', 'G', 'Am', 'C'][bar % 4], bar, null).id);
  assert.ok(seen.size >= 2, 'a song does not get the same fill everywhere');
});

test('auto: small fills at line ends, big ones at the end of a paragraph, all of them on the grid', () => {
  for (const p of PATTERNS) {
    const phrase = buildSongPhrase(timing, p, 0, { style: 'auto', where: 'line' });
    assert.ok(phrase.fills && phrase.fills.length > 0, p.id);
    const bigBars = timing.blocks.map((b) => b.end - 1).filter((b) => b + 1 < timing.totalBars);
    for (const b of bigBars) assert.ok(phrase.fills!.some((f) => f.bar === b), `${p.id}: a fill ends paragraph at bar ${b}`);
    for (const f of phrase.fills!) {
      assert.ok(f.from >= 0 && f.from < phrase.stepsPerBar, `${p.id}: fill starts inside the bar`);
      for (const d of f.drums) assert.ok(d.step >= 0 && d.step < phrase.stepsPerBar + 1e-9, `${p.id}: drum hit inside the bar (${d.step})`);
    }
    for (const e of phrase.events) {
      assert.ok(Number.isInteger(e.step) && e.step >= 0 && e.step < phrase.stepsPerBar, `${p.id}: guitar note on a slot (${e.step})`);
    }
  }
});

test('the fill replaces the pattern from where it starts, and the groove stops there', () => {
  const p = pattern('bolero');
  const phrase = buildSongPhrase(timing, p, 0, { style: 'groove', where: 'end' });
  const withDrums = addDrums(phrase, p, 'full');
  for (const f of phrase.fills!) {
    const patternHits = phrase.events.filter((e) => e.bar === f.bar && !e.fill && e.step >= f.from);
    assert.equal(patternHits.length, 0);
    const kicks = withDrums.drums!.filter((d) => d.bar === f.bar && d.kind === 'K' && d.step >= f.from);
    assert.equal(kicks.length, 0, 'no groove kick under the fill');
    assert.ok(withDrums.drums!.some((d) => d.bar === f.bar && d.step >= f.from), 'the drums play the fill');
  }
});

test('drums: a big fill ends with a crash on the next downbeat, but a light part never crashes', () => {
  const p = pattern('rumba');
  const phrase = buildSongPhrase(timing, p, 0, { style: 'groove', where: 'end' });
  const crashFill = phrase.fills!.find((f) => f.crash)!;
  assert.ok(crashFill, 'a big rumba fill has a crash');
  const full = addDrums(phrase, p, 'full');
  assert.ok(full.drums!.some((d) => d.kind === 'C' && d.bar === crashFill.bar + 1 && d.step === 0));
  const light = addDrums(phrase, p, 'light');
  assert.equal(light.drums!.filter((d) => d.kind === 'C' || d.kind === 'S' || d.kind === 'T').length, 0);
});

test('bass: it doubles the guitar notes, or drops out, as the fill says', () => {
  for (const id of ['bolero', 'rumba', 'tango', 'bossa-nova']) {
    const p = pattern(id);
    const phrase = buildSongPhrase(timing, p, 0, { style: 'auto', where: 'line' });
    const withBass = addBass(phrase, p, songSegments(timing, phrase.stepsPerBar), true);
    for (const f of phrase.fills!) {
      const after = withBass.bass!.filter((b) => b.bar === f.bar && b.step >= f.from);
      if (f.bass === 'rest') assert.equal(after.length, 0, `${id}: the bass rests under a "rest" fill`);
      if (f.bass === 'unison') {
        const melody = phrase.events.filter((e) => e.bar === f.bar && e.fillNote).map((e) => e.step);
        if (melody.length) assert.deepEqual(after.map((b) => b.step), melody, `${id}: the bass plays the guitar's notes`);
      }
      for (const b of after) assert.ok(b.midi >= 31 - 12 && b.midi <= 60, `${id}: the bass stays low`);
    }
  }
});

test('an old-style fill still works as before', () => {
  const p = pattern('bolero');
  const phrase = buildSongPhrase(timing, p, 0, { style: 'bass-run', where: 'line' });
  assert.equal(phrase.fills, undefined);
  assert.ok(phrase.events.some((e) => e.fill));
});
