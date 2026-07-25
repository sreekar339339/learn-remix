import { TypedEventTarget } from "remix/ui";
import { CustomEvents } from "./utils/customEvents/index.tsx";

type TempoBpm = number;

class DrummerEvents extends CustomEvents<{
  play: TempoBpm;
  stop: TempoBpm;
  tempo: TempoBpm;
}> {}

export class Drummer extends TypedEventTarget<DrummerEvents["map"]> {
  #isPlaying = false;
  #tempoBpm = 90;
  events = new DrummerEvents({ host: this });

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
    this.dispatchEvent(this.events.create("tempo", this.#tempoBpm));
  }

  play(bpm = this.#tempoBpm) {
    this.setTempo(bpm);
    if (this.#isPlaying) return;
    this.#isPlaying = true;
    this.dispatchEvent(this.events.create("play", this.#tempoBpm));
  }

  stop() {
    if (!this.#isPlaying) return;
    this.#isPlaying = false;
    this.dispatchEvent(this.events.create("stop", this.#tempoBpm));
  }
}
