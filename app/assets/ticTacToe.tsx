import { clientEntry, css, on, ref } from "remix/ui";
import { CustomEvents } from "./utils/customEvents.tsx";

type Player = "X" | "O";
type Result = Player | "Draw" | "Pending";
class TicTacToeEvents extends CustomEvents<{
  turn: {
    result: Result;
    position: Map<number, Player>;
    nextPlayer: Player;
  };
  focus: { cellId: number };
}> {}

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

function deriveResult(position: Map<number, Player>): Result {
  for (let [a, b, c] of winningCombos) {
    if (
      position.has(a) &&
      position.get(a) === position.get(b) &&
      position.get(a) === position.get(c)
    ) {
      return position.get(a)!;
    }
  }
  return position.size === 9 ? "Draw" : "Pending";
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
    let ticTacToeEvents = new TicTacToeEvents();
    let { turn, focus, change } = ticTacToeEvents;

    ticTacToeEvents.seed(
      turn({
        result: "Pending",
        position: new Map(),
        nextPlayer: "X",
      }),
    );

    return () => (
      <div
        mix={[
          css({
            display: "grid",
            gap: 16,
            maxWidth: 360,
          }),
          ref((board) => {
            queueMicrotask(
              () => board.dispatchEvent(ticTacToeEvents.focus({ cellId: 0 })),
            );
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
              if (position.has(cellId) || result !== "Pending") return;
              let nextPosition = new Map(position).set(cellId, nextPlayer);
              let nextResult = deriveResult(nextPosition);
              let nextFreeCellIdx = cellId;
              while (nextPosition.has(nextFreeCellIdx)) {
                nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
                if (nextFreeCellIdx === cellId) break;
              }
              currentTarget.dispatchEvent(
                change({
                  turn: {
                    position: nextPosition,
                    nextPlayer: nextPlayer === "X" ? "O" : "X",
                    result: nextResult,
                  },
                  ...(nextResult === "Pending"
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
              currentTarget.dispatchEvent(focus({ cellId: nextFreeCellIdx }));
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <ticTacToeEvents.turn
              key={index}
              render={({ detail }, turnHandle) => (
                <button
                  value={index}
                  disabled={
                    detail.position.has(index) || detail.result !== "Pending"
                  }
                  class={detail.position.get(index)}
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
                  {detail.position.get(index)}
                </button>
              )}
            />
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            ticTacToeEvents.on("turn", ({ detail, currentTarget }) => {
              if (detail.result === "Pending") return;
              currentTarget.focus();
            }),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                ticTacToeEvents.change({
                  turn: {
                    result: "Pending",
                    position: new Map(),
                    nextPlayer: "X",
                  },
                  focus: { cellId: 0 },
                }),
              );
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
          <ticTacToeEvents.turn
            render={({ detail }) => {
              if (detail.result === "Pending") return "Game in progress";
              if (detail.result === "Draw") return "Game is drawn.";
              return `${detail.result} has won!`;
            }}
          />
        </p>
      </div>
    );
  },
);
