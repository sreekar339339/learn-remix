import { clientEntry, css, on, ref } from "remix/ui";
import { customEvents } from "./utils/customEvents/index.tsx";

type Player = "X" | "O";
type Result = Player | "Draw";

let winningCombos = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function deriveResult(position: Map<number, Player>): Result | null {
  for (let [a, b, c] of winningCombos) {
    if (
      position.has(a) &&
      position.get(a) === position.get(b) &&
      position.get(a) === position.get(c)
    ) {
      return position.get(a)!;
    }
  }
  return position.size === 9 ? "Draw" : null;
}

let arrowKeyIdxIncrementMap = {
  ArrowUp: -3,
  ArrowDown: 3,
  ArrowLeft: -1,
  ArrowRight: 1,
};

let isArrowKey = (
  eventKey: unknown,
): eventKey is keyof typeof arrowKeyIdxIncrementMap => {
  return Object.hasOwn(arrowKeyIdxIncrementMap, eventKey as string);
};

export const TicTacToeCustomEvents = clientEntry(
  import.meta.url,
  function TicTacToeCustomEvents() {
    let game = customEvents<{
      position: Map<number, Player>;
      result: Result | null;
      focusTargetId: number | null;
    }>().withState({
      position: new Map<number, Player>(),
      result: null as Result | null,
      focusTargetId: 0 as number | null,
    });
    let cellEvents = game.events.on(["position", "result"]);

    return () => (
      <div
        mix={css({
          display: "grid",
          gap: 16,
          maxWidth: 360,
        })}
      >
        <div
          mix={[
            css({
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
            }),
            on("click", ({ target }) => {
              if (!(target instanceof HTMLButtonElement)) return;
              let cellId = Number(target.id);
              if (game.position.has(cellId) || game.result !== null) return;
              let nextPlayer: Player = game.position.size % 2 === 0
                ? "X"
                : "O";
              let position = new Map(game.position).set(cellId, nextPlayer);
              let result = deriveResult(position);
              game.patch(
                result === null
                  ? { position }
                  : { position, result },
                result === null ? { key: cellId } : undefined,
              );
              let nextFreeCellIdx = cellId;
              while (position.has(nextFreeCellIdx)) {
                nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
                if (nextFreeCellIdx === cellId) break;
              }
              if (result === null) {
                game.patch(
                  { focusTargetId: nextFreeCellIdx },
                  { key: nextFreeCellIdx },
                );
              }
            }),
            on("keydown", ({ key, target }) => {
              if (!isArrowKey(key)) return;
              if (!(target instanceof HTMLButtonElement)) return;
              let cellId = Number(target.id);
              let idxIncrement = arrowKeyIdxIncrementMap[key];
              let boundIdx = idxIncrement < 0 ? 0 : 8;
              let nextFreeCellIdx = cellId;
              while (
                nextFreeCellIdx === cellId ||
                game.position.has(nextFreeCellIdx)
              ) {
                nextFreeCellIdx += idxIncrement;
                if (
                  (boundIdx === 0 && nextFreeCellIdx < boundIdx) ||
                  (boundIdx === 8 && nextFreeCellIdx > boundIdx)
                ) {
                  break;
                }
              }
              game.patch(
                { focusTargetId: nextFreeCellIdx },
                { key: nextFreeCellIdx },
              );
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <cellEvents.button
              key={index}
              id={String(index)}
              disabled={() => game.position.has(index) || game.result !== null}
              class={() => game.position.get(index)}
              mix={[
                css({
                  aspectRatio: "1/1",
                  fontSize: 32,
                  fontWeight: "bold",
                  "&.X": {
                    color: "blue",
                  },
                  "&.O": {
                    color: "red",
                  },
                }),
                game.events.on(
                  "focusTargetId",
                  ({ currentTarget }) => {
                    if (Number(currentTarget.id) === game.focusTargetId) {
                      currentTarget.focus();
                    }
                  },
                ),
              ]}
              child={() => game.position.get(index)}
            />
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            game.events.on("result", ({ currentTarget }) => {
              if (game.result === null) return;
              currentTarget.focus();
            }),
            on("click", () => {
              game.patch({
                position: new Map<number, Player>(),
                result: null,
                focusTargetId: 0,
              });
            }),
            ref((_reset, signal) => {
              queueMicrotask(() => {
                if (!signal.aborted) {
                  game.patch({ focusTargetId: 0 }, { key: 0 });
                }
              });
            }),
          ]}
        >
          Reset
        </button>
        <p
          mix={[
            css({
              fontSize: 18,
              textAlign: "center",
            }),
          ]}
        >
          <game.events.on.position.span
            child={() => {
              if (!game.result) return "Game in progress";
              if (game.result === "Draw") return "Game is drawn.";
              return `${game.result} has won!`;
            }}
          />
        </p>
      </div>
    );
  },
);
