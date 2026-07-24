import { clientEntry, css, on, ref } from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

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
  function TicTacToeCustomEvents(handle) {
    let events = new CustomEvents<"nextTurn" | "nextFocus">();
    let game = {
      position: new Map(),
      nextPlayer: "X" as Player,
      result: null as Result | null,
      focusCellId: 0,
    };

    return () => (
      <div
        mix={[
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
              let cellId = Number(target.value);
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
              game.focusCellId = nextFreeCellIdx;
              currentTarget.dispatchEvent(
                game.result === null
                  ? events.change(["nextTurn", "nextFocus"])
                  : events.change(["nextTurn"]),
              );
            }),
            on("keydown", ({ key, target, currentTarget }) => {
              if (!isArrowKey(key)) return;
              if (!(target instanceof HTMLButtonElement)) return;
              let cellId = Number(target.value);
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
              game.focusCellId = nextFreeCellIdx;
              currentTarget.dispatchEvent(events.nextFocus());
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <events.on.nextTurn
              key={index}
              render={() => (
                <button
                  value={index}
                  disabled={game.position.has(index) || game.result !== null}
                  class={game.position.get(index)}
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
                    events.on("nextFocus", ({ currentTarget }) => {
                      if (game.focusCellId !== index) return;
                      currentTarget.focus();
                    }),
                  ]}
                >
                  {game.position.get(index)}
                </button>
              )}
            />
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            events.on("nextTurn", ({ currentTarget }) => {
              if (game.result === null) return;
              currentTarget.focus();
            }),
            on("click", ({ currentTarget }) => {
              game.position.clear();
              game.result = null;
              game.nextPlayer = "X";
              game.focusCellId = 0;
              currentTarget.dispatchEvent(
                events.change(["nextTurn", "nextFocus"]),
              );
            }),
            ref((reset) => reset.dispatchEvent(events.nextFocus())),
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
          <events.on.nextTurn
            render={() => {
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
