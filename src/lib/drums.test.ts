import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDrums } from './drums.ts';
import { renderDrum } from './drumKit.ts';
import { buildPhrase, PATTERNS } from './patterns.ts';

const pattern = (id: string) => PATTERNS.find((p) => p.id === id)!;
const phraseOf = (id: string, fill = false) =>
  buildPhrase(['C', 'G', 'Am', 'F'], pattern(id), 1, 0, fill ? { style: 'lick', where: 'every' } : undefined);

test('drums off leaves the phrase alone', () => {
  const phrase = phraseOf('pop-strum');
  assert.equal(addDrums(phrase, pattern('pop-strum'), 'off'), phrase);
});

test('every rhythm gets a groove that fits its grid, with a kick on the first beat', () => {
  for (const p of PATTERNS) {
    const phrase = addDrums(buildPhrase(['C', 'G'], p, 1), p, 'full');
    assert.ok(phrase.drums && phrase.drums.length > 0, p.id);
    assert.ok(phrase.drums.every((d) => d.step >= 0 && d.step < phrase.stepsPerBar), `${p.id}: steps inside the bar`);
    assert.ok(phrase.drums.some((d) => d.bar === 0 && d.step === 0 && d.kind === 'K'), `${p.id}: kick on 1`);
  }
});

test('light drums use a rim click instead of the snare and play fewer notes', () => {
  const p = pattern('pop-strum');
  const light = addDrums(phraseOf('pop-strum'), p, 'light').drums!;
  const full = addDrums(phraseOf('pop-strum'), p, 'full').drums!;
  assert.ok(!light.some((d) => d.kind === 'S'));
  assert.ok(full.some((d) => d.kind === 'S'));
  assert.ok(light.length <= full.length);
});

test('a full part rolls through a guitar fill and crashes into the next bar', () => {
  const p = pattern('pop-strum');
  const phrase = phraseOf('pop-strum', true);
  const fillBar = phrase.events.find((e) => e.fill)!.bar;
  const from = Math.min(...phrase.events.filter((e) => e.fill && e.bar === fillBar).map((e) => e.step));
  const drums = addDrums(phrase, p, 'full').drums!;
  const inFill = drums.filter((d) => d.bar === fillBar && d.step >= from);
  assert.ok(inFill.length >= 2 && inFill.every((d) => d.kind === 'S' || d.kind === 'T'), 'only the roll plays under the fill');
  assert.ok(drums.some((d) => d.bar === fillBar + 1 && d.step === 0 && d.kind === 'C'));
});

test('the held last bar gets one kick (and a crash when full), nothing else', () => {
  const p = pattern('bolero');
  const phrase = buildPhrase(['C', 'G', 'Am', 'F'], p, 1);
  const last = phrase.bars - 1;
  const drums = addDrums(phrase, p, 'full', { holdBar: last }).drums!.filter((d) => d.bar === last);
  assert.deepEqual(drums.map((d) => d.kind).sort(), ['C', 'K']);
});

test('drum sounds are audible, bounded, deterministic and end quietly', () => {
  for (const kind of ['K', 'S', 'R', 'H', 'O', 'T', 'C'] as const) {
    const a = renderDrum(kind, 44100);
    assert.ok(a.length > 500, kind);
    assert.ok(a.every(Number.isFinite), kind);
    assert.ok(Math.max(...a.map(Math.abs)) <= 1.0001 && Math.max(...a.map(Math.abs)) > 0.5, kind);
    assert.ok(a[a.length - 1] === 0, kind); // also true for -0
    assert.deepEqual(renderDrum(kind, 44100), a, `${kind} is the same every time`);
  }
});

test('each drum has variants that differ, so repeated hits are not identical', () => {
  for (const kind of ['K', 'S', 'H'] as const) {
    const [a, b] = [renderDrum(kind, 44100, 0), renderDrum(kind, 44100, 1)];
    assert.notDeepEqual(a, b, kind);
    assert.ok(a.every(Number.isFinite) && b.every(Number.isFinite));
  }
});

test('a full part uses open hats and more than one variant', () => {
  const p = pattern('pop-strum');
  const drums = addDrums(buildPhrase(['C', 'G', 'Am', 'F'], p, 2), p, 'full').drums!;
  assert.ok(drums.some((d) => d.kind === 'O'));
  assert.ok(new Set(drums.map((d) => d.variant)).size > 1);
});

test('the ballroom tango rolls the snare on the "and" of 4, swelling into the next bar', () => {
  const p = PATTERNS.find((x) => x.id === 'tango')!;
  const built = buildPhrase(['Am', 'E'], p);
  const full = addDrums(built, p, 'full').drums!.filter((d) => d.bar === 0 && d.step >= 7);
  assert.equal(full.length, 4);
  assert.ok(full.every((d) => d.kind === 'S' && d.step < 8));
  assert.ok(full[3].gain > full[0].gain);
  const light = addDrums(built, p, 'light').drums!.filter((d) => d.bar === 0 && d.step >= 7);
  assert.deepEqual(light.map((d) => d.kind), ['R']);
});
