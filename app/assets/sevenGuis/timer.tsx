import { clientEntry, on, ref } from "remix/ui";
import { CustomEvents } from "../utils/customEvents/index.tsx";
import { buttonCss, inputCss, rowCss, taskCss } from "./styles.ts";

type TimerModel = { elapsed: number; duration: number };
export const SevenGuisTimer = clientEntry(
  import.meta.url,
  function SevenGuisTimer(handle) {
    let events = new CustomEvents<"clockAdvanced">();
    let timer: TimerModel = { elapsed: 0, duration: 10 };

    return () => (
      <section
        mix={[
          taskCss,
          events.host(),
          ref((section, signal) => {
            let last = performance.now();
            let id = window.setInterval(() => {
              let now = performance.now();
              let delta = (now - last) / 1000;
              last = now;
              if (timer.elapsed >= timer.duration) return;
              timer.elapsed = Math.min(timer.duration, timer.elapsed + delta);
              section.dispatchEvent(events("clockAdvanced"));
            }, 100);
            signal.addEventListener("abort", () => window.clearInterval(id), {
              once: true,
            });
          }),
        ]}
      >
        <h2>Timer</h2>
        <events.on.clockAdvanced.div
          child={() => (
            <>
              <progress
                value={Math.min(1, timer.elapsed / timer.duration)}
                max={1}
              />
              <output>{timer.elapsed.toFixed(1)}s elapsed</output>
            </>
          )}
        />
        <label mix={rowCss}>
          Duration
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            defaultValue={10}
            mix={[
              inputCss,
              on("input", ({ currentTarget }) => {
                timer.duration = currentTarget.valueAsNumber;
                timer.elapsed = Math.min(timer.elapsed, timer.duration);
                handle.update();
              }),
            ]}
          />
          <span>{timer.duration.toFixed(1)}s</span>
        </label>
        <button
          type="button"
          mix={[
            buttonCss,
            on("click", ({ currentTarget }) => {
              timer.elapsed = 0;
              currentTarget.dispatchEvent(events("clockAdvanced"));
            }),
          ]}
        >
          Reset
        </button>
      </section>
    );
  },
);
