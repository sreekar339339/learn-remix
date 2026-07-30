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
    let events = customEvents<
      "gameStateChanged" | "cellFocusRequested"
    >();
    let game = {
      position: new Map(),
      nextPlayer: "X" as Player,
      result: null as Result | null,
    };

    return () => (
      <div
        mix={[
          events.host(),
          css({
            display: "grid",
            gap: 16,
            maxWidth: 360,
          }),
        ]}
      >
        <div
          mix={[
            css({
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
            }),
            on("click", ({ target, currentTarget }) => {
              if (!(target instanceof HTMLButtonElement)) return;
              let cellId = Number(target.id);
              let { position, nextPlayer, result } = game;
              if (position.has(cellId) || result !== null) return;
              game.position.set(cellId, nextPlayer);
              game.result = deriveResult(game.position);
              game.nextPlayer = nextPlayer === "X" ? "O" : "X";
              let nextFreeCellIdx = cellId;
              while (game.position.has(nextFreeCellIdx)) {
                nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
                if (nextFreeCellIdx === cellId) break;
              }
              currentTarget.dispatchEvent(
                events("gameStateChanged", { key: cellId }),
              );
              if (game.result === null) {
                currentTarget.dispatchEvent(
                  events("cellFocusRequested", { key: nextFreeCellIdx }),
                );
              }
            }),
            on("keydown", ({ key, target, currentTarget }) => {
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
              currentTarget.dispatchEvent(
                events("cellFocusRequested", { key: nextFreeCellIdx }),
              );
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <events.on.gameStateChanged.button
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
                events.on("cellFocusRequested", ({ currentTarget }) => {
                  currentTarget.focus();
                }),
              ]}
              child={() => game.position.get(index)}
            />
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            events.on("gameStateChanged", ({ currentTarget }) => {
              if (game.result === null) return;
              currentTarget.focus();
            }),
            on("click", ({ currentTarget }) => {
              game.position.clear();
              game.result = null;
              game.nextPlayer = "X";
              currentTarget.dispatchEvent(
                events([
                  "gameStateChanged",
                  {
                    cellFocusRequested: {
                      options: { key: 0 },
                    },
                  },
                ]),
              );
            }),
            ref((reset, signal) => {
              queueMicrotask(() => {
                if (!signal.aborted) {
                  reset.dispatchEvent(
                    events("cellFocusRequested", { key: 0 }),
                  );
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
          <events.on.gameStateChanged.span
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
