import { CustomEvents } from "./utils/customEvents/index.tsx";

type TempoBpm = number;

export class Drummer extends EventTarget {
  #isPlaying = false;
  #tempoBpm = 90;
  events = new CustomEvents<{
    playbackStarted: TempoBpm;
    playbackStopped: TempoBpm;
    tempoSet: TempoBpm;
  }>({ host: this });

  constructor() {
    super();
  }

  get isPlaying() {
    return this.#isPlaying;
  }

  get bpm() {
    return this.#tempoBpm;
  }

  setTempo(bpm: number) {
    this.#tempoBpm = Math.max(30, Math.min(300, Math.floor(bpm || 90)));
    this.dispatchEvent(this.events("tempoSet", this.#tempoBpm));
  }

  play(bpm = this.#tempoBpm) {
    this.setTempo(bpm);
    if (this.#isPlaying) return;
    this.#isPlaying = true;
    this.dispatchEvent(this.events("playbackStarted", this.#tempoBpm));
  }

  stop() {
    if (!this.#isPlaying) return;
    this.#isPlaying = false;
    this.dispatchEvent(this.events("playbackStopped", this.#tempoBpm));
  }
}
