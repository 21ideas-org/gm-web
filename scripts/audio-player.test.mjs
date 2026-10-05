import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeAudioPlayer } from '../src/lib/audio-player.mjs';

class Control extends EventTarget {
  dataset = {};
  disabled = false;
  hidden = false;
  textContent = '';
  value = '0';
  attrs = {};
  styles = {};
  classes = new Set();
  style = { setProperty: (key, value) => { this.styles[key] = value; } };
  classList = { toggle: (key, enabled) => enabled ? this.classes.add(key) : this.classes.delete(key) };
  setAttribute(key, value) { this.attrs[key] = value; }
}
function fixture() {
  const audio = new Control();
  Object.assign(audio, { controls: true, paused: true, ended: false, duration: NaN, currentTime: 0, calls: 0 });
  audio.pause = () => { const playing = !audio.paused; audio.paused = true; if (playing) audio.dispatchEvent(new Event('pause')); };
  audio.start = () => { audio.paused = false; audio.dispatchEvent(new Event('play')); if (!audio.paused) audio.dispatchEvent(new Event('playing')); };
  audio.play = () => { audio.calls++; audio.start(); return Promise.resolve(); };
  const panel = new Control(), toggle = new Control(), seek = new Control(), time = new Control(), status = new Control();
  panel.hidden = true;
  const elements = { audio, '[data-audio-controls]': panel, '[data-audio-toggle]': toggle,
    '[data-audio-seek]': seek, '[data-audio-time]': time, '[data-audio-status]': status };
  const root = new Control();
  root.dataset.audioDuration = '177.76';
  root.querySelector = (selector) => elements[selector] || null;
  return { root, audio, panel, toggle, seek, time, status };
}
const click = async (button) => { button.dispatchEvent(new Event('click')); await Promise.resolve(); };

test('initialization shows known duration without loading audio; metadata enables seeking', () => {
  const f = fixture(); initializeAudioPlayer(f.root);
  assert.equal(f.audio.calls, 0);
  assert.equal(f.panel.hidden, false); assert.equal(f.audio.controls, false); assert.equal(f.audio.hidden, true);
  assert.equal(f.time.textContent, '0:00 / 2:58'); assert.equal(f.seek.disabled, true);
  f.audio.duration = 177.76; f.audio.dispatchEvent(new Event('loadedmetadata'));
  assert.equal(f.seek.disabled, false); assert.equal(f.seek.max, '177.76');
});
test('missing panel leaves native controls available', () => {
  const f = fixture(); f.root.querySelector = (selector) => selector === 'audio' ? f.audio : null;
  initializeAudioPlayer(f.root); assert.equal(f.audio.controls, true); assert.equal(f.audio.hidden, false);
});
test('play, pause, completion and repeated initialization preserve state and one handler', async () => {
  const f = fixture(); initializeAudioPlayer(f.root); initializeAudioPlayer(f.root);
  await click(f.toggle); assert.equal(f.audio.calls, 1); assert.equal(f.root.dataset.playing, 'true');
  assert.equal(f.toggle.attrs['aria-label'], 'Приостановить');
  await click(f.toggle); assert.equal(f.audio.paused, true); assert.equal(f.toggle.attrs['aria-label'], 'Воспроизвести');
  await click(f.toggle); f.audio.ended = true; f.audio.paused = true; f.audio.dispatchEvent(new Event('ended'));
  assert.equal(f.root.dataset.playing, 'false'); assert.equal(f.toggle.attrs['aria-label'], 'Воспроизвести');
});
test('seek updates media time without starting playback and clamps out-of-range input', () => {
  const f = fixture(); initializeAudioPlayer(f.root); f.audio.duration = 180;
  f.seek.value = '90'; f.seek.dispatchEvent(new Event('input'));
  assert.equal(f.audio.currentTime, 90); assert.equal(f.audio.calls, 0); assert.equal(f.time.textContent, '1:30 / 3:00');
  assert.equal(f.seek.styles['--audio-progress'], '50%');
  f.seek.value = '999'; f.seek.dispatchEvent(new Event('input')); assert.equal(f.audio.currentTime, 180);
  f.seek.value = 'NaN'; f.seek.dispatchEvent(new Event('input')); assert.equal(f.audio.currentTime, 180);
});
test('rejected play is reported and can be retried', async () => {
  const f = fixture(); f.audio.play = () => Promise.reject(new Error('NotAllowedError'));
  initializeAudioPlayer(f.root); await click(f.toggle);
  assert.equal(f.root.dataset.playing, 'false'); assert.equal(f.toggle.disabled, false);
  assert.ok(f.status.classes.has('audio-status-error'));
  f.audio.play = () => { f.audio.start(); return Promise.resolve(); }; await click(f.toggle);
  assert.equal(f.root.dataset.playing, 'true'); assert.equal(f.status.textContent, '');
});
test('pause while play is pending prevents late playback and drops its old rejection', async () => {
  const f = fixture(); let reject;
  f.audio.play = () => new Promise((_resolve, fail) => { reject = fail; });
  initializeAudioPlayer(f.root); await click(f.toggle); await click(f.toggle);
  f.audio.start(); assert.equal(f.audio.paused, true);
  reject(new Error('AbortError')); await Promise.resolve(); assert.equal(f.status.textContent, '');
});
test('media failure stops playback and exposes a readable error', async () => {
  const f = fixture(); initializeAudioPlayer(f.root); await click(f.toggle);
  f.audio.duration = 180;
  f.audio.dispatchEvent(new Event('error'));
  f.audio.dispatchEvent(new Event('timeupdate'));
  assert.equal(f.audio.paused, true); assert.equal(f.toggle.disabled, true); assert.equal(f.seek.disabled, true);
  assert.ok(f.status.classes.has('audio-status-error')); assert.match(f.status.textContent, /недоступно/);
});

test('system media controls can resume paused playback after a completed UI request', async () => {
  const f = fixture(); initializeAudioPlayer(f.root);
  await click(f.toggle); await click(f.toggle);
  f.audio.start();
  assert.equal(f.audio.paused, false);
  assert.equal(f.root.dataset.playing, 'true');
  assert.equal(f.toggle.attrs['aria-label'], 'Приостановить');
});
