import { clientEntry, css, on, ref } from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

type Player = "X" | "O";
type Result = Player | "Draw";
type EventMap = {
  turn: {
    result: Result | null;
    position: Map<number, Player>;
    nextPlayer: Player;
  };
  focus: { cellId: number };
};

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
    let ticTacToeEvents = new CustomEvents<EventMap>();

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
              let { position, nextPlayer, result } =
                ticTacToeEvents.getHost(currentTarget).latest?.eventMap.turn!;
              if (position.has(cellId) || result !== null) return;
              let nextPosition = new Map(position).set(cellId, nextPlayer);
              let nextResult = deriveResult(nextPosition);
              let nextFreeCellIdx = cellId;
              while (nextPosition.has(nextFreeCellIdx)) {
                nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
                if (nextFreeCellIdx === cellId) break;
              }
              currentTarget.dispatchEvent(
                ticTacToeEvents.change({
                  turn: {
                    position: nextPosition,
                    nextPlayer: nextPlayer === "X" ? "O" : "X",
                    result: nextResult,
                  },
                  ...(nextResult === null
                    ? { focus: { cellId: nextFreeCellIdx } }
                    : {}),
                }),
              );
            }),
            on("keydown", ({ key, target, currentTarget }) => {
              if (!isArrowKey(key)) return;
              if (!(target instanceof HTMLButtonElement)) return;
              let cellId = Number(target.value);
              let idxIncrement = arrowKeyIdxIncrementMap[key];
              let boundIdx = idxIncrement < 0 ? 0 : 8;
              let nextFreeCellIdx = cellId;
              let { position } =
                ticTacToeEvents.getHost(currentTarget).latest?.eventMap.turn!;
              while (
                nextFreeCellIdx === cellId ||
                position.has(nextFreeCellIdx)
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
                ticTacToeEvents.focus({ cellId: nextFreeCellIdx }),
              );
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <ticTacToeEvents.on.turn
              key={index}
              render={(turnEvent, turnHandle) => (
                <button
                  value={index}
                  disabled={
                    turnEvent?.detail.position.has(index) ||
                    turnEvent?.detail.result !== null
                  }
                  class={turnEvent?.detail.position.get(index)}
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
                    ticTacToeEvents.on("focus", ({ detail, currentTarget }) => {
                      if (detail.cellId !== index) return;
                      currentTarget.focus();
                      turnHandle.queueTask(() => currentTarget.focus());
                    }),
                  ]}
                >
                  {turnEvent?.detail.position.get(index)}
                </button>
              )}
            />
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            ticTacToeEvents.on("turn", ({ detail, currentTarget }) => {
              if (detail.result === null) return;
              currentTarget.focus();
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                ticTacToeEvents.change({
                  turn: {
                    result: null,
                    position: new Map(),
                    nextPlayer: "X",
                  },
                  focus: { cellId: 0 },
                }),
              );
            }),
            ref((reset) => reset.click()),
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
          <ticTacToeEvents.on.turn
            render={(turnEvent) => {
              if (!turnEvent || !turnEvent.detail.result)
                return "Game in progress";
              if (turnEvent.detail.result === "Draw") return "Game is drawn.";
              return `${turnEvent.detail.result} has won!`;
            }}
          />
        </p>
      </div>
    );
  },
);
