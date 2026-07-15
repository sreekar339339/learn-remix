import { clientEntry, css, on, ref, type Handle } from "remix/ui";
import { customEvents } from "./utils/customEvents.tsx";

type Player = "X" | "O";
type Result = Player | "Draw" | "Pending";

const gameEvents = customEvents<{
  turn: { result: Result; position: Map<number, Player>; nextPlayer: Player };
  focus: { cellId: number };
}>();

type GameEventMap = (typeof gameEvents)["eventMap"];

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
  function TicTacToeCustomEvents() {
    let currentGame = {
      turn: {
        result: "Pending",
        position: new Map(),
        nextPlayer: "X",
      },
      focus: { cellId: 0 },
    } satisfies GameEventMap["change"]["detail"]["details"];

    return () => (
      <div
        mix={[
          css({
            display: "grid",
            gap: 16,
            maxWidth: 360,
          }),
          gameEvents.listen(
            on("change", ({ detail }) => {
              Object.assign(currentGame, detail.details);
            }),
          ),
          ref((node) => {
            node.dispatchEvent(gameEvents(currentGame));
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
              let { position, nextPlayer } = currentGame.turn;
              if (position.has(cellId) || currentGame.turn.result !== "Pending")
                return;
              let nextPosition = new Map(position).set(cellId, nextPlayer);
              let nextFreeCellIdx = cellId;
              while (nextPosition.has(nextFreeCellIdx)) {
                nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
                if (nextFreeCellIdx === cellId) {
                  // We've looped through all cells and found no free cell
                  break;
                }
              }
              currentTarget.dispatchEvent(
                gameEvents({
                  turn: {
                    position: nextPosition,
                    nextPlayer: nextPlayer === "X" ? "O" : "X",
                    result: deriveResult(nextPosition),
                  },
                  focus: { cellId: nextFreeCellIdx },
                }),
              );
            }),
            on("keydown", ({ key, target, currentTarget }) => {
              if (!isArrowKey(key)) return;
              let cell = target as HTMLButtonElement;
              let cellId = Number(cell.value);
              let idxIncrement = arrowKeyIdxIncrementMap[key];
              let nextFreeCellIdx = cellId;
              let boundIdx = idxIncrement < 0 ? 0 : 8;
              let { position } = currentGame.turn;
              while (
                nextFreeCellIdx === cellId ||
                position.has(nextFreeCellIdx)
              ) {
                nextFreeCellIdx += idxIncrement;
                if (
                  (boundIdx === 0 && nextFreeCellIdx < boundIdx) ||
                  (boundIdx === 8 && nextFreeCellIdx > boundIdx)
                )
                  return;
              }
              currentTarget.dispatchEvent(
                gameEvents.focus({ cellId: nextFreeCellIdx }),
              );
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <button
              key={index}
              value={index}
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
                gameEvents.listen(
                  on("turn", ({ currentTarget, detail }) => {
                    currentTarget.toggleAttribute(
                      "disabled",
                      detail.position.has(index) || detail.result !== "Pending",
                    );
                    currentTarget.classList.toggle(
                      detail.position.get(index)!,
                      detail.position.has(index),
                    );
                  }),
                  on("focus", ({ detail, currentTarget }) => {
                    if (detail.cellId !== index) return;
                    currentTarget.focus();
                  }),
                ),
              ]}
            >
              <gameEvents.turn
                initial={currentGame}
                render={({ detail }) => detail.position.get(index)}
              />
            </button>
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            gameEvents.listen(
              on("turn", ({ detail, currentTarget }) => {
                if (detail.result === "Pending") return;
                currentTarget.focus();
              }),
            ),
            on("click", ({ currentTarget }) => {
              currentTarget.dispatchEvent(
                gameEvents({
                  turn: {
                    position: new Map(),
                    nextPlayer: "X",
                    result: "Pending",
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
          <gameEvents.turn
            initial={currentGame}
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
