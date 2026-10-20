export interface VoyagerControls {
  hang: number;
  yearn: number;
  mist: number;
  drift: number;
  tide: number;
  breath: number;
}

type Voice = {
  oscillators: OscillatorNode[];
  vibrato: OscillatorNode;
  vibratoDepth: GainNode;
  breathGain: GainNode;
  gain: GainNode;
  stopped: boolean;
};

const DEFAULT_CONTROLS: VoyagerControls = {
  hang: 4.5,
  yearn: 35,
  mist: 72,
  drift: 6,
  tide: 1800,
  breath: 18,
};

export class VoyagerAudio {
  private context: AudioContext | null = null;
  private filter: BiquadFilterNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private voices = new Map<string, Voice>();
  private controls = { ...DEFAULT_CONTROLS };

  async wake(): Promise<void> {
    if (this.context == null) {
      const Context = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Context == null) throw new Error('Web Audio is not available in this browser.');

      const context = new Context();
      const master = context.createGain();
      const filter = context.createBiquadFilter();
      const dry = context.createGain();
      const wet = context.createGain();
      const convolver = context.createConvolver();
      filter.type = 'lowpass';
      convolver.buffer = this.makeImpulse(context);
      filter.connect(dry);
      dry.connect(master);
      filter.connect(convolver);
      convolver.connect(wet);
      wet.connect(master);
      master.connect(context.destination);
      master.gain.value = 0.72;

      this.context = context;
      this.filter = filter;
      this.dry = dry;
      this.wet = wet;
      this.applyControls();
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setControls(controls: VoyagerControls): void {
    this.controls = { ...controls };
    this.applyControls();
    const now = this.context?.currentTime ?? 0;
    for (const voice of this.voices.values()) {
      voice.oscillators[0]?.detune.setTargetAtTime(controls.drift, now, 0.04);
      voice.oscillators[1]?.detune.setTargetAtTime(-controls.drift, now, 0.04);
      voice.vibratoDepth.gain.setTargetAtTime(controls.yearn * 0.22, now, 0.06);
      voice.breathGain.gain.setTargetAtTime((controls.breath / 100) * 0.012, now, 0.05);
    }
  }

  playReed(index: number, frequency: number): void {
    this.playFrequency(`reed-${index}`, frequency);
  }

  releaseReed(index: number): void {
    this.release(`reed-${index}`, this.controls.hang);
  }

  startDrone(): void {
    [55, 82.41, 110].forEach((frequency, index) => this.playFrequency(`drone-${index}`, frequency));
  }

  stopDrone(): void {
    this.releasePrefix('drone-');
  }

  startVoyagePad(): void {
    [130.81, 196, 261.63, 329.63].forEach((frequency, index) => this.playFrequency(`pad-${index}`, frequency));
  }

  stopVoyagePad(): void {
    this.releasePrefix('pad-');
  }

  silenceAll(): void {
    for (const id of this.voices.keys()) this.release(id, 0.12);
  }

  dispose(): void {
    this.silenceAll();
    const context = this.context;
    this.context = null;
    if (context != null && context.state !== 'closed') void context.close();
  }

  private playFrequency(id: string, frequency: number): void {
    const context = this.context;
    const filter = this.filter;
    if (context == null || filter == null) return;
    this.release(id, 0.02);

    const now = context.currentTime;
    const gain = context.createGain();
    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();
    const overtoneGain = context.createGain();
    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const breathGain = context.createGain();

    fundamental.type = 'sine';
    fundamental.frequency.value = frequency;
    fundamental.detune.value = this.controls.drift;
    overtone.type = 'triangle';
    overtone.frequency.value = frequency * 2;
    overtone.detune.value = -this.controls.drift;
    overtoneGain.gain.value = 0.11;
    vibrato.type = 'sine';
    vibrato.frequency.value = 4.6;
    vibratoDepth.gain.value = this.controls.yearn * 0.22;
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(fundamental.detune);

    const envelopeSeconds = 0.12;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.19, now + envelopeSeconds);
    fundamental.connect(gain);
    overtone.connect(overtoneGain);
    overtoneGain.connect(gain);

    const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.35), context.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i += 1) channel[i] = Math.random() * 2 - 1;
    noise.buffer = noiseBuffer;
    noise.loop = true;
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1300;
    breathGain.gain.value = (this.controls.breath / 100) * 0.012;
    noise.connect(noiseFilter);
    noiseFilter.connect(breathGain);
    breathGain.connect(gain);
    gain.connect(filter);

    const voice: Voice = {
      oscillators: [fundamental, overtone],
      vibrato,
      vibratoDepth,
      breathGain,
      gain,
      stopped: false,
    };
    this.voices.set(id, voice);
    fundamental.start(now);
    overtone.start(now);
    vibrato.start(now);
    noise.start(now);
  }

  private release(id: string, seconds: number): void {
    const voice = this.voices.get(id);
    const context = this.context;
    if (voice == null || context == null || voice.stopped) return;
    voice.stopped = true;
    const now = context.currentTime;
    const end = now + Math.max(0.025, seconds);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(voice.gain.gain.value, 0.0001), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, end);
    voice.oscillators.forEach((oscillator) => oscillator.stop(end + 0.04));
    voice.vibrato.stop(end + 0.04);
    const timeout = Math.max(80, seconds * 1000 + 100);
    window.setTimeout(() => {
      if (this.voices.get(id) === voice) this.voices.delete(id);
    }, timeout);
  }

  private releasePrefix(prefix: string): void {
    for (const id of this.voices.keys()) {
      if (id.startsWith(prefix)) this.release(id, this.controls.hang);
    }
  }

  private applyControls(): void {
    const context = this.context;
    if (context == null) return;
    const now = context.currentTime;
    this.filter?.frequency.setTargetAtTime(this.controls.tide, now, 0.08);
    this.dry?.gain.setTargetAtTime(0.82 - (this.controls.mist / 100) * 0.18, now, 0.08);
    this.wet?.gain.setTargetAtTime((this.controls.mist / 100) * 0.52, now, 0.08);
  }

  private makeImpulse(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 2.4);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
      const data = impulse.getChannelData(channelIndex);
      for (let i = 0; i < length; i += 1) {
        const fade = Math.pow(1 - i / length, 3.2);
        data[i] = (Math.random() * 2 - 1) * fade;
      }
    }
    return impulse;
  }
}
