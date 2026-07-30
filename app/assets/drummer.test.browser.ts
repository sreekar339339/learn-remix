import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { Drummer } from "./drummer.ts";

describe("Drummer", () => {
  it("publishes domain events through its configured host", () => {
    let drummer = new Drummer();
    let events: string[] = [];

    drummer.events.on({
      tempoSet({ detail }) {
        events.push(`tempoSet:${detail}`);
      },
      playbackStarted({ detail }) {
        events.push(`playbackStarted:${detail}`);
      },
      playbackStopped({ detail }) {
        events.push(`playbackStopped:${detail}`);
      },
    });

    drummer.play(120);
    drummer.stop();

    assert.equal(drummer.bpm, 120);
    assert.equal(drummer.isPlaying, false);
    assert.deepEqual(events, [
      "tempoSet:120",
      "playbackStarted:120",
      "playbackStopped:120",
    ]);
  });
});
