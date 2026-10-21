let muted = true;
let context: AudioContext | null = null;

export function soundIsMuted() {
  return muted;
}

export function setSoundMuted(value: boolean) {
  muted = value;
}

export type SoundName = "tap" | "correct" | "wrong" | "tick" | "finish" | "streak" | "start";

const patterns: Record<SoundName, { frequency: number; duration: number; delay?: number; type?: OscillatorType; gain?: number }[]> = {
  tap: [{ frequency: 620, duration: 0.05, type: "triangle", gain: 0.05 }],
  correct: [{ frequency: 660, duration: 0.09, type: "sine" }, { frequency: 990, duration: 0.14, delay: 0.07, type: "sine" }],
  wrong: [{ frequency: 220, duration: 0.16, type: "sawtooth", gain: 0.05 }, { frequency: 150, duration: 0.2, delay: 0.1, type: "sawtooth", gain: 0.04 }],
  tick: [{ frequency: 880, duration: 0.035, type: "square", gain: 0.025 }],
  finish: [{ frequency: 523, duration: 0.12, type: "sine" }, { frequency: 659, duration: 0.12, delay: 0.1, type: "sine" }, { frequency: 784, duration: 0.12, delay: 0.2, type: "sine" }, { frequency: 1046, duration: 0.24, delay: 0.3, type: "sine" }],
  streak: [{ frequency: 784, duration: 0.08, type: "triangle" }, { frequency: 1175, duration: 0.12, delay: 0.06, type: "triangle" }],
  start: [{ frequency: 392, duration: 0.1, type: "sine" }, { frequency: 587, duration: 0.16, delay: 0.09, type: "sine" }]
};

export function playSound(name: SoundName) {
  if (muted || typeof window === "undefined") return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume();
    const started = context.currentTime;
    for (const note of patterns[name]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const begin = started + (note.delay ?? 0);
      oscillator.type = note.type ?? "sine";
      oscillator.frequency.setValueAtTime(note.frequency, begin);
      gain.gain.setValueAtTime(0, begin);
      gain.gain.linearRampToValueAtTime(note.gain ?? 0.06, begin + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + note.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(begin);
      oscillator.stop(begin + note.duration + 0.02);
    }
  } catch { /* Audio is a progressive enhancement. */ }
}
