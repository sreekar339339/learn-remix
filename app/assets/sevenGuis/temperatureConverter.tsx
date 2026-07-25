import { clientEntry, on } from "remix/ui";
import { CustomEvents } from "../utils/customEvents/index.tsx";
import { inputCss, rowCss, taskCss } from "./styles.ts";

function parseTemperature(value: string) {
  let number = Number(value);
  return Number.isFinite(number) && value.trim() !== "" ? number : undefined;
}

function formatTemperature(value: number) {
  return Number(value.toFixed(2)).toString();
}

export const SevenGuisTemperatureConverter = clientEntry(
  import.meta.url,
  function SevenGuisTemperatureConverter() {
    let events = new CustomEvents<"temperatureConverted">();
    let temperature = { celsius: "", fahrenheit: "" };

    return () => (
      <section mix={taskCss}>
        <h2>Temperature Converter</h2>
        <events.on.temperatureConverted
          render={() => (
            <div mix={rowCss}>
              <input
                aria-label="Celsius"
                value={temperature.celsius}
                mix={[
                  inputCss,
                  on("input", ({ currentTarget }) => {
                    let value = currentTarget.value;
                    let number = parseTemperature(value);
                    if (number === undefined) return;
                    temperature.celsius = value;
                    temperature.fahrenheit = formatTemperature(
                      number * (9 / 5) + 32,
                    );
                    currentTarget.dispatchEvent(
                      events("temperatureConverted"),
                    );
                  }),
                ]}
              />
              <span>Celsius =</span>
              <input
                aria-label="Fahrenheit"
                value={temperature.fahrenheit}
                mix={[
                  inputCss,
                  on("input", ({ currentTarget }) => {
                    let value = currentTarget.value;
                    let number = parseTemperature(value);
                    if (number === undefined) return;
                    temperature.celsius = formatTemperature(
                      (number - 32) * (5 / 9),
                    );
                    temperature.fahrenheit = value;
                    currentTarget.dispatchEvent(
                      events("temperatureConverted"),
                    );
                  }),
                ]}
              />
              <span>Fahrenheit</span>
            </div>
          )}
        />
      </section>
    );
  },
);
