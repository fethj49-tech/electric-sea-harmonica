import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Headphones,
  Moon,
  Music2,
  Pause,
  Play,
  Radio,
  Save,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Waves,
  Wind,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useLiveNodes } from '@/hooks/use-live-nodes';
import {
  createNode,
  getFieldNumber,
  getFieldValue,
  getTitle,
  type GenesisNode,
} from '@/lib/genesis-data';
import { useTheme } from '@/hooks/use-theme';
import { VoyagerAudio, type VoyagerControls } from '@/lib/voyager-audio';

const PROJECT_ID = '34w3a7jYSMrpXgSS';
const NOTE_NAMES = ['C3', 'D3', 'Eb3', 'F3', 'G3', 'A3', 'Bb3', 'C4', 'D4', 'Eb4', 'F4', 'G4', 'A4', 'Bb4', 'C5'];
const NOTE_MIDI = [48, 50, 51, 53, 55, 57, 58, 60, 62, 63, 65, 67, 69, 70, 72];
const KEY_MAP: Record<string, number> = {
  z: 0, x: 1, c: 2, v: 3, b: 4, n: 5, m: 6, ',': 7, '.': 8, '/': 9,
  a: 7, s: 8, d: 9, f: 10, g: 11, h: 12, j: 13, k: 14,
  q: 3, w: 4, e: 5, r: 6, t: 7, y: 8, u: 9, i: 10, o: 11, p: 12,
};
const DEFAULT_CONTROLS: VoyagerControls = {
  hang: 4.5,
  yearn: 35,
  mist: 72,
  drift: 6,
  tide: 1800,
  breath: 18,
};

const CONTROL_DEFINITIONS: Array<{
  key: keyof VoyagerControls;
  title: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  icon: typeof AudioLines;
}> = [
  { key: 'hang', title: 'Hang', description: 'How long each note lingers', min: 0.6, max: 8, step: 0.1, unit: 's', icon: AudioLines },
  { key: 'yearn', title: 'Yearn', description: 'A slow, tender vibrato', min: 0, max: 100, step: 1, unit: '%', icon: Waves },
  { key: 'mist', title: 'Mist', description: 'The room around the reeds', min: 0, max: 100, step: 1, unit: '%', icon: Sparkles },
  { key: 'drift', title: 'Drift', description: 'Gentle pitch movement', min: 0, max: 16, step: 1, unit: '¢', icon: Music2 },
  { key: 'tide', title: 'Tide', description: 'Warmth of the low-pass filter', min: 300, max: 6000, step: 50, unit: 'Hz', icon: Waves },
  { key: 'breath', title: 'Breath', description: 'Soft air at the start of a note', min: 0, max: 60, step: 1, unit: '%', icon: Wind },
];

function noteFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function fieldNumber(row: GenesisNode, field: string, fallback: number): number {
  return getFieldNumber(row, field) ?? fallback;
}

function readPreset(row: GenesisNode): VoyagerControls {
  return {
    hang: fieldNumber(row, 'Hang (seconds)', DEFAULT_CONTROLS.hang),
    yearn: fieldNumber(row, 'Yearn (%)', DEFAULT_CONTROLS.yearn),
    mist: fieldNumber(row, 'Mist (%)', DEFAULT_CONTROLS.mist),
    drift: fieldNumber(row, 'Drift (cents)', DEFAULT_CONTROLS.drift),
    tide: fieldNumber(row, 'Tide (Hz)', DEFAULT_CONTROLS.tide),
    breath: fieldNumber(row, 'Breath (%)', DEFAULT_CONTROLS.breath),
  };
}

function formatControl(value: number, unit: string): string {
  const display = unit === 's' ? value.toFixed(1) : Math.round(value).toLocaleString();
  return `${display} ${unit}`;
}

export default function HomePage() {
  const { isDark, toggle } = useTheme();
  const { nodes, loading, error, updatedAt, refresh } = useLiveNodes(PROJECT_ID);
  const audioRef = useRef<VoyagerAudio | null>(null);
  const pressedKeys = useRef(new Set<string>());
  const [controls, setControls] = useState<VoyagerControls>({ ...DEFAULT_CONTROLS });
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const [awake, setAwake] = useState(false);
  const [mode, setMode] = useState<'quiet' | 'awake' | 'drone' | 'pad'>('quiet');
  const [audioError, setAudioError] = useState('');
  const [presetName, setPresetName] = useState('');
  const [presetNotes, setPresetNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  if (audioRef.current == null) audioRef.current = new VoyagerAudio();

  useEffect(() => {
    document.title = 'Electric Sea Harmonica | Voyager';
    return () => audioRef.current?.dispose();
  }, []);

  useEffect(() => {
    audioRef.current?.setControls(controls);
  }, [controls]);

  const presets = useMemo(
    () => nodes.filter((row) => ['Sample data', 'Saved'].includes(getFieldValue(row, 'Label') ?? '')),
    [nodes],
  );
  const journal = useMemo(
    () => nodes.find((row) => getFieldValue(row, 'Label') === 'Journal'),
    [nodes],
  );

  async function awaken(): Promise<void> {
    try {
      setAudioError('');
      await audioRef.current?.wake();
      audioRef.current?.setControls(controls);
      setAwake(true);
      setMode('awake');
    } catch (cause) {
      setAudioError(cause instanceof Error ? cause.message : 'The instrument could not start audio.');
    }
  }

  function changeControl(key: keyof VoyagerControls, value: number): void {
    setControls((current) => ({ ...current, [key]: value }));
  }

  function startReed(index: number): void {
    if (!awake) return;
    audioRef.current?.playReed(index, noteFrequency(NOTE_MIDI[index]));
    setActiveNotes((current) => new Set(current).add(index));
  }

  function releaseReed(index: number): void {
    audioRef.current?.releaseReed(index);
    setActiveNotes((current) => {
      const next = new Set(current);
      next.delete(index);
      return next;
    });
  }

  function activateDrone(): void {
    if (!awake) return;
    if (mode === 'drone') {
      audioRef.current?.stopDrone();
      setMode('awake');
      return;
    }
    audioRef.current?.silenceAll();
    audioRef.current?.startDrone();
    setActiveNotes(new Set());
    setMode('drone');
  }

  function activatePad(): void {
    if (!awake) return;
    if (mode === 'pad') {
      audioRef.current?.stopVoyagePad();
      setMode('awake');
      return;
    }
    audioRef.current?.silenceAll();
    audioRef.current?.startVoyagePad();
    setActiveNotes(new Set());
    setMode('pad');
  }

  function silenceAll(): void {
    audioRef.current?.silenceAll();
    setActiveNotes(new Set());
    setMode('quiet');
  }

  useEffect(() => {
    if (!awake) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      const index = KEY_MAP[key];
      if (index == null || pressedKeys.current.has(key)) return;
      event.preventDefault();
      pressedKeys.current.add(key);
      startReed(index);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const index = KEY_MAP[key];
      if (index == null || !pressedKeys.current.has(key)) return;
      pressedKeys.current.delete(key);
      releaseReed(index);
    };
    const releaseHeld = () => {
      for (const key of pressedKeys.current) {
        const index = KEY_MAP[key];
        if (index != null) releaseReed(index);
      }
      pressedKeys.current.clear();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseHeld);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseHeld);
      releaseHeld();
    };
  }, [awake]);

  async function savePreset(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const name = presetName.trim();
    if (!name) {
      setSaveError('Give this sound a name before saving.');
      return;
    }
    setSaving(true);
    setSaveError('');
    setSaveMessage('');
    try {
      const fields: Record<string, string | number> = {
        Name: name,
        'Hang (seconds)': controls.hang,
        'Yearn (%)': controls.yearn,
        'Mist (%)': controls.mist,
        'Drift (cents)': controls.drift,
        'Tide (Hz)': controls.tide,
        'Breath (%)': controls.breath,
        Label: 'Saved',
      };
      if (presetNotes.trim()) fields.Notes = presetNotes.trim();
      const result = await createNode(PROJECT_ID, fields);
      await refresh();
      if (result.ignoredKeys.length > 0) {
        setSaveError(`The preset was saved, but these details did not match a project field: ${result.ignoredKeys.join(', ')}.`);
        return;
      }
      setSaveMessage(`${name} is saved in your voyage library.`);
      setPresetName('');
      setPresetNotes('');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'The preset could not be saved. Your settings are still on screen.');
    } finally {
      setSaving(false);
    }
  }

  function loadPreset(row: GenesisNode): void {
    const next = readPreset(row);
    setControls(next);
    audioRef.current?.setControls(next);
    setSaveMessage(`${getTitle(row, 'Name', 'Title') ?? 'Preset'} is ready to play.`);
    setSaveError('');
  }

  const journalText = journal == null ? null : getFieldValue(journal, 'Notes');

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <a className="flex min-h-11 items-center gap-3" href="#top" aria-label="Voyager home">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Waves aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold tracking-[0.16em]">VOYAGER</span>
              <span className="block text-[11px] tracking-[0.18em] text-muted-foreground">ELECTRIC SEA HARMONICA</span>
            </span>
          </a>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden gap-2 sm:flex">
              <span className={`size-1.5 rounded-full ${awake ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
              {mode === 'drone' ? 'Sea drone' : mode === 'pad' ? 'Voyage pad' : awake ? 'Awake' : 'At rest'}
            </Badge>
            <Button variant="ghost" size="icon" className="min-h-11 min-w-11 rounded-full" onClick={toggle} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>
              {isDark ? <Sun aria-hidden="true" className="size-4" /> : <Moon aria-hidden="true" className="size-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <section className="voyager-stage relative isolate overflow-hidden rounded-[2rem] border border-border/70 px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
          <div aria-hidden="true" className="voyager-glow pointer-events-none absolute inset-0" />
          <div aria-hidden="true" className="voyager-stars pointer-events-none absolute inset-0 opacity-70" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div className="max-w-2xl">
              <p className="mb-4 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.28em] text-primary">
                <Sparkles aria-hidden="true" className="size-4" /> A little instrument for open water
              </p>
              <h1 className="max-w-xl text-4xl font-light leading-tight tracking-tight sm:text-6xl">
                Let the tide <span className="font-semibold text-primary">carry</span> the note.
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                Fifteen reeds, a breath of sea air, and room for the sound to wander. Find a key, then follow it somewhere quiet.
              </p>
            </div>
            <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-background/50 p-4 shadow-sm backdrop-blur sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
              <div className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Headphones aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{awake ? 'The reeds are awake' : 'Begin with one breath'}</p>
                  <p className="truncate text-xs text-muted-foreground">{awake ? 'Touch a reed or use your keyboard.' : 'Audio begins only when you invite it.'}</p>
                </div>
              </div>
              <Button onClick={() => void awaken()} className="min-h-11 gap-2 rounded-full px-5">
                <Play aria-hidden="true" className="size-4" /> {awake ? 'Wake again' : 'Awaken instrument'}
              </Button>
            </div>
          </div>
          <div className="relative z-10 mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" /> C3 to C5</span>
            <span>Keys Z–M, then A–K</span>
            <span>Sound stays in this browser</span>
          </div>
          {audioError && <p className="relative z-10 mt-3 text-sm text-destructive" role="alert">{audioError}</p>}
        </section>

        <section aria-labelledby="soundscape-title" className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <Card className="overflow-hidden rounded-3xl border-border/70">
            <CardHeader className="pb-3">
              <CardDescription className="flex items-center gap-2 uppercase tracking-[0.2em]"><Radio aria-hidden="true" className="size-3.5" /> Soundscape</CardDescription>
              <CardTitle id="soundscape-title" className="text-xl font-medium">Choose your current</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button variant={mode === 'drone' ? 'default' : 'outline'} className="min-h-12 justify-start gap-2 rounded-2xl px-3" onClick={activateDrone} disabled={!awake}>
                {mode === 'drone' ? <Pause aria-hidden="true" className="size-4" /> : <Waves aria-hidden="true" className="size-4" />} Sea drone
              </Button>
              <Button variant={mode === 'pad' ? 'default' : 'outline'} className="min-h-12 justify-start gap-2 rounded-2xl px-3" onClick={activatePad} disabled={!awake}>
                {mode === 'pad' ? <Pause aria-hidden="true" className="size-4" /> : <Music2 aria-hidden="true" className="size-4" />} Voyage pad
              </Button>
              <Button variant="ghost" className="min-h-12 justify-start gap-2 rounded-2xl px-3 text-muted-foreground" onClick={silenceAll} disabled={!awake}>
                <VolumeX aria-hidden="true" className="size-4" /> Silence all
              </Button>
              <div className="flex min-h-12 items-center justify-end gap-2 px-2 text-xs text-muted-foreground" aria-live="polite">
                <Volume2 aria-hidden="true" className="size-4" /> {mode === 'quiet' ? 'Resting' : 'Sound on'}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70">
            <CardHeader className="flex flex-row items-end justify-between gap-4 pb-4">
              <div>
                <CardDescription className="flex items-center gap-2 uppercase tracking-[0.2em]"><Music2 aria-hidden="true" className="size-3.5" /> The reed rail</CardDescription>
                <CardTitle className="mt-1 text-xl font-medium">Play the open notes</CardTitle>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">Hold to sound, release to let it hang</span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
                {NOTE_NAMES.map((note, index) => {
                  const key = Object.entries(KEY_MAP).find(([, mapped]) => mapped === index)?.[0] ?? '';
                  const active = activeNotes.has(index);
                  const isAccidental = note.includes('b');
                  return (
                    <button
                      key={note}
                      type="button"
                      disabled={!awake}
                      aria-label={`${note}, keyboard ${key.toUpperCase()}`}
                      aria-pressed={active}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
                        startReed(index);
                      }}
                      onPointerUp={() => releaseReed(index)}
                      onPointerCancel={() => releaseReed(index)}
                      onLostPointerCapture={() => releaseReed(index)}
                      className={`reed-key group flex min-h-28 flex-col items-center justify-between rounded-xl border px-1.5 py-3 text-center transition duration-200 hover:-translate-y-1 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-36 sm:rounded-2xl ${isAccidental ? 'bg-accent/70' : 'bg-muted/60'} ${active ? 'border-primary bg-primary/15 shadow-[0_0_24px_hsl(var(--primary)/0.20)]' : 'border-border/80'}`}
                    >
                      <span className="text-[10px] text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                      <span className="text-sm font-medium tracking-tight sm:text-base">{note}</span>
                      <span className="rounded-md bg-background/70 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{key}</span>
                    </button>
                  );
                })}
              </div>
              {!awake && <p className="mt-3 text-xs text-muted-foreground">Awaken the instrument to play the reeds.</p>}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="controls-title">
          <Card className="rounded-3xl border-border/70">
            <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardDescription className="flex items-center gap-2 uppercase tracking-[0.2em]"><AudioLines aria-hidden="true" className="size-3.5" /> Tuning the water</CardDescription>
                <CardTitle id="controls-title" className="mt-1 text-xl font-medium">Shape the breath</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground">Every movement changes the sound as you play.</p>
            </CardHeader>
            <CardContent className="grid gap-x-8 gap-y-6 md:grid-cols-2 lg:grid-cols-3">
              {CONTROL_DEFINITIONS.map((control) => {
                const Icon = control.icon;
                const value = controls[control.key];
                return (
                  <div key={control.key} className="min-w-0 rounded-2xl bg-muted/40 p-4">
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span>
                        <div className="min-w-0">
                          <Label htmlFor={`control-${control.key}`} className="text-sm font-semibold">{control.title}</Label>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{control.description}</p>
                        </div>
                      </div>
                      <output htmlFor={`control-${control.key}`} className="shrink-0 font-mono text-xs tabular-nums text-primary">{formatControl(value, control.unit)}</output>
                    </div>
                    <Slider
                      id={`control-${control.key}`}
                      aria-label={`${control.title}: ${formatControl(value, control.unit)}`}
                      min={control.min}
                      max={control.max}
                      step={control.step}
                      value={[value]}
                      onValueChange={([next]) => changeControl(control.key, next)}
                      className="py-2"
                    />
                    <div className="mt-2 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground"><span>{control.min} {control.unit}</span><span>{control.max.toLocaleString()} {control.unit}</span></div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="presets-title" className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card className="rounded-3xl border-border/70">
            <CardHeader>
              <CardDescription className="flex items-center gap-2 uppercase tracking-[0.2em]"><Save aria-hidden="true" className="size-3.5" /> Save a sound</CardDescription>
              <CardTitle className="text-xl font-medium">Keep this setting</CardTitle>
              <CardDescription>Save the six current controls as a preset you can return to.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={(event) => void savePreset(event)}>
                <div className="space-y-2">
                  <Label htmlFor="preset-name">Preset name</Label>
                  <Input id="preset-name" autoComplete="off" value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="Name this sound" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preset-notes">A note for later <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="preset-notes" autoComplete="off" value={presetNotes} onChange={(event) => setPresetNotes(event.target.value)} placeholder="What does it feel like?" />
                </div>
                <Button type="submit" className="min-h-11 w-full gap-2 rounded-full" disabled={saving}>
                  <Save aria-hidden="true" className="size-4" /> {saving ? 'Saving sound…' : 'Save this preset'}
                </Button>
                {saveError && <p className="text-sm text-destructive" role="alert">{saveError}</p>}
                {saveMessage && !saveError && <p className="text-sm text-primary" role="status">{saveMessage}</p>}
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-border/70">
            <CardHeader className="flex flex-row items-end justify-between gap-3">
              <div>
                <CardDescription className="flex items-center gap-2 uppercase tracking-[0.2em]"><Waves aria-hidden="true" className="size-3.5" /> Your voyage library</CardDescription>
                <CardTitle id="presets-title" className="mt-1 text-xl font-medium">Presets to return to</CardTitle>
              </div>
              <Button variant="ghost" size="sm" className="min-h-11 gap-2 rounded-full" onClick={() => void refresh()} aria-label="Refresh presets and weekly note">
                <AudioLines aria-hidden="true" className="size-4" /> Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {error && updatedAt == null ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert">
                  <p>Could not load the voyage library.</p>
                  <Button variant="link" className="mt-1 min-h-11 px-0" onClick={() => void refresh()}>Try again</Button>
                </div>
              ) : loading && updatedAt == null ? (
                <div className="space-y-3" aria-label="Loading presets"><div className="h-20 animate-pulse rounded-2xl bg-muted" /><div className="h-20 animate-pulse rounded-2xl bg-muted" /></div>
              ) : presets.length === 0 ? (
                <p className="rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">Your saved sounds will gather here. The starting presets are loading if this is your first visit.</p>
              ) : (
                presets.map((row) => {
                  const name = getTitle(row, 'Name', 'Title') ?? 'Untitled sound';
                  const notes = getFieldValue(row, 'Notes');
                  const isSample = getFieldValue(row, 'Label') === 'Sample data';
                  return (
                    <article key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm font-semibold">{name}</h3>
                          {isSample && <Badge variant="secondary" className="text-[10px]">Starting sound</Badge>}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{notes || 'A sound saved from the Voyager controls.'}</p>
                        <p className="mt-2 truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                          {formatControl(fieldNumber(row, 'Hang (seconds)', DEFAULT_CONTROLS.hang), 's')} · {Math.round(fieldNumber(row, 'Yearn (%)', DEFAULT_CONTROLS.yearn))}% Yearn · {Math.round(fieldNumber(row, 'Mist (%)', DEFAULT_CONTROLS.mist))}% Mist
                        </p>
                      </div>
                      <Button variant="outline" className="min-h-11 shrink-0 gap-2 rounded-full" onClick={() => loadPreset(row)}>
                        <Play aria-hidden="true" className="size-3.5" /> Recall
                      </Button>
                    </article>
                  );
                })
              )}
              {error && updatedAt != null && <p className="text-xs text-muted-foreground">The last refresh did not complete. <button className="underline underline-offset-4" onClick={() => void refresh()}>Refresh now</button></p>}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="journal-title">
          <Card className="relative overflow-hidden rounded-3xl border-primary/20 bg-primary/[0.035]">
            <div aria-hidden="true" className="voyager-glow pointer-events-none absolute inset-0 opacity-60" />
            <CardHeader className="relative z-10 flex flex-row items-start gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Sparkles aria-hidden="true" className="size-5" /></span>
              <div className="min-w-0">
                <CardDescription className="uppercase tracking-[0.2em]">A note from the tide</CardDescription>
                <CardTitle id="journal-title" className="mt-1 text-xl font-medium">Weekly voyage reflection</CardTitle>
                <CardDescription className="mt-1">The Voyage Guide refreshes this space every Monday at 9:00 AM Pacific.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 pl-[4.75rem]">
              <p className="max-w-3xl text-sm leading-7 text-foreground/90" aria-live="polite">
                {journalText || 'The first reflection will appear here after its Monday voyage.'}
              </p>
            </CardContent>
          </Card>
        </section>

        {updatedAt != null && (
          <p className="text-center text-xs text-muted-foreground">Your presets live in this workspace. Audio is generated locally and is not saved.</p>
        )}
      </main>
    </div>
  );
}
