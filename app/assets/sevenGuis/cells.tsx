import { clientEntry, css, on, ref } from "remix/ui";
import { CustomEvents } from "../utils/customEvents/index.tsx";
import { taskCss } from "./styles.ts";

const columns = ["A", "B", "C", "D", "E", "F"] as const;
const rows = Array.from({ length: 12 }, (_, index) => index);
type CellId = `${(typeof columns)[number]}${number}`;
type Values = Partial<Record<CellId, string>>;
type Sheet = {
  formulas: Values;
  values: Values;
};

function cellId(column: (typeof columns)[number], row: number): CellId {
  return `${column}${row}`;
}

function evaluate(formula: string | undefined, values: Values): string {
  if (!formula) return "";
  if (!formula.startsWith("=")) return formula;
  let expression = formula
    .slice(1)
    .replace(/\b[A-F](?:[0-9]|1[01])\b/g, (reference) =>
      String(Number(values[reference as CellId] ?? 0)),
    );
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return "#ERR";
  try {
    let result = Function(`"use strict"; return (${expression})`)();
    return Number.isFinite(result) ? String(result) : "#ERR";
  } catch {
    return "#ERR";
  }
}

function calculate(formulas: Values): Values {
  let values: Values = {};
  for (let pass = 0; pass < 8; pass++) {
    for (let row of rows) {
      for (let column of columns) {
        let id = cellId(column, row);
        values[id] = evaluate(formulas[id], values);
      }
    }
  }
  return values;
}

let cellCss = css({
  width: "100%",
  padding: "4px 6px",
  textAlign: "right",
  border: "1px solid transparent",
  borderRadius: 0,
  background: "transparent",
  font: "inherit",
  boxSizing: "border-box",
});

export const SevenGuisCells = clientEntry(
  import.meta.url,
  function SevenGuisCells() {
    let events = new CustomEvents<"edit">();
    let formulas: Values = { A0: "10", B0: "20", C0: "=A0+B0" };
    let sheet: Sheet = { formulas, values: calculate(formulas) };
    let localEditEvtOpts = { bubbles: false };

    return () => (
      <section mix={taskCss}>
        <h2>Cells</h2>
        <div
          mix={css({
            overflow: "auto",
            maxHeight: 360,
            border: "1px solid #d4d4d8",
          })}
        >
          <table
            mix={css({
              borderCollapse: "collapse",
              minWidth: 620,
              "& th, & td": { border: "1px solid #e4e4e7", padding: 0 },
              "& th": { padding: "4px 6px" },
            })}
          >
            <thead>
              <tr>
                <th />
                {columns.map((column) => (
                  <th>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr>
                  <th>{row}</th>
                  {columns.map((column, __, _, id = cellId(column, row)) => (
                    <td key={`${id}:${sheet.values[id] ?? ""}`}>
                      <events.on.edit.input
                        aria-label={id}
                        value={(_, event) => {
                          if (event?.currentTarget.dataset.editing) return;
                          return sheet.values[id];
                        }}
                        placeholder={() => sheet.formulas[id]}
                        mix={[
                          cellCss,
                          on("blur", ({ currentTarget }) => {
                            delete currentTarget.dataset.editing;
                            if (!currentTarget.value) {
                              return void currentTarget.dispatchEvent(
                                events("edit", localEditEvtOpts),
                              );
                            }
                            sheet.formulas[id] = currentTarget.value;
                            sheet.values = calculate(sheet.formulas);
                            currentTarget.dispatchEvent(events("edit"));
                          }),
                          on("focus", ({ currentTarget }) => {
                            currentTarget.dataset.editing = "true";
                            currentTarget.dispatchEvent(
                              events("edit", localEditEvtOpts),
                            );
                          }),
                        ]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  },
);
