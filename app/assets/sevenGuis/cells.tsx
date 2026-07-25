import { clientEntry, css, on, ref } from "remix/ui";
import { CustomEvents } from "../utils/customEvents.tsx";
import { inputCss, taskCss } from "./styles.ts";

const columns = ["A", "B", "C", "D", "E", "F"] as const;
const rows = Array.from({ length: 12 }, (_, index) => index);

type CellId = `${(typeof columns)[number]}${number}`;
type SheetModel = {
  formulas: Partial<Record<CellId, string>>;
  values: Partial<Record<CellId, string>>;
  editing: CellId | null;
};

type CellUpdates = Partial<Record<CellId, null>>;

function cellId(column: (typeof columns)[number], row: number): CellId {
  return `${column}${row}`;
}

function evaluateFormula(
  formula: string | undefined,
  values: Partial<Record<CellId, string>>,
) {
  if (!formula) return "";
  if (!formula.startsWith("=")) return formula;
  let expression = formula
    .slice(1)
    .replace(/\b[A-F](?:[0-9]|1[01])\b/g, (reference) => {
      let value = Number(values[reference as CellId] ?? 0);
      return Number.isFinite(value) ? String(value) : "0";
    });
  if (!/^[\d+\-*/().\s]+$/.test(expression)) return "#ERR";
  try {
    let result = Function(`"use strict"; return (${expression})`)();
    return Number.isFinite(result) ? String(result) : "#ERR";
  } catch {
    return "#ERR";
  }
}

function computeValues(formulas: Partial<Record<CellId, string>>) {
  let values: Partial<Record<CellId, string>> = {};
  for (let index = 0; index < 8; index += 1) {
    let changed = false;
    for (let row of rows) {
      for (let column of columns) {
        let id = cellId(column, row);
        let value = evaluateFormula(formulas[id], values);
        if (values[id] !== value) {
          values[id] = value;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return values;
}

function cellUpdates(cellIds: Iterable<CellId>) {
  let updates: CellUpdates = {};
  for (let id of cellIds) updates[id] = null;
  return updates;
}

export const SevenGuisCells = clientEntry(
  import.meta.url,
  function SevenGuisCells() {
    let events = new CustomEvents<CellId>();
    let formulas = {
      A0: "10",
      B0: "20",
      C0: "=A0+B0",
    } satisfies SheetModel["formulas"];
    let sheet: SheetModel = {
      formulas,
      values: computeValues(formulas),
      editing: null,
    };
    events.seed(
      events.create(
        cellUpdates(
          rows.flatMap((row) => columns.map((column) => cellId(column, row))),
        ),
      ),
    );

    function renderCell(id: CellId) {
      let Cell = events.on[id];

      return (
        <Cell
          render={() => {
            let editing = sheet.editing === id;
            return editing ? (
              <input
                aria-label={id}
                defaultValue={sheet.formulas[id] ?? ""}
                mix={[
                  inputCss,
                  css({
                    width: "100%",
                    border: 0,
                    borderRadius: 0,
                  }),
                  ref((input) => input.focus()),
                  on("blur", ({ currentTarget }) => {
                    let previousValues = { ...sheet.values };
                    sheet.formulas[id] = currentTarget.value;
                    let nextValues = computeValues(sheet.formulas);
                    Object.assign(sheet.values, nextValues);
                    sheet.editing = null;
                    let changedIds = rows.flatMap((row) =>
                      columns
                        .map((column) => cellId(column, row))
                        .filter(
                          (cell) => previousValues[cell] !== nextValues[cell],
                        ),
                    );
                    currentTarget.dispatchEvent(
                      events.create(cellUpdates(new Set([...changedIds, id]))),
                    );
                  }),
                  on("keydown", ({ key, currentTarget }) => {
                    if (key === "Enter") currentTarget.blur();
                  }),
                ]}
              />
            ) : (
              <button
                type="button"
                aria-label={id}
                mix={[
                  css({
                    width: "100%",
                    minHeight: 28,
                    border: 0,
                    background: "transparent",
                    textAlign: "right",
                    padding: "4px 6px",
                    font: "inherit",
                  }),
                  on("click", ({ currentTarget }) => {
                    sheet.editing = id;
                    currentTarget.dispatchEvent(events.create(id));
                  }),
                ]}
              >
                {sheet.values[id] ?? ""}
              </button>
            );
          }}
        />
      );
    }

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
              "& th, & td": {
                border: "1px solid #e4e4e7",
                padding: 0,
              },
              "& th": {
                padding: "4px 6px",
              },
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
                  {columns.map((column) => (
                    <td>{renderCell(cellId(column, row))}</td>
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
