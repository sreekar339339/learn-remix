import { TypedEventTarget } from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

class DrummerEvents extends CustomEvents<{
  play: { tempoBpm: number };
  stop: { tempoBpm: number };
  tempo: { tempoBpm: number };
}> {}

export class Drummer extends TypedEventTarget<DrummerEvents["map"]> {
  #isPlaying = false;
  #tempoBpm = 90;
  events = new DrummerEvents({host: this});

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
    this.dispatchEvent(this.events.tempo({ tempoBpm: this.#tempoBpm }));
  }

  play(bpm = this.#tempoBpm) {
    this.setTempo(bpm);
    if (this.#isPlaying) return;
    this.#isPlaying = true;
    this.dispatchEvent(this.events.play({ tempoBpm: this.#tempoBpm }));
  }

  stop() {
    if (!this.#isPlaying) return;
    this.#isPlaying = false;
    this.dispatchEvent(this.events.stop({ tempoBpm: this.#tempoBpm }));
  }
}
