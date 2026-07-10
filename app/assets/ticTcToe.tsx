import {
  clientEntry,
  css,
  on,
  TypedEventTarget,
  type Handle,
} from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";
import { onCustomEvent } from "./utils/onCustomEvent.tsx";

type Player = "X" | "O";
type Result = Player | "Draw" | "Pending";
type TicTacToeEventMap = CustomEventMap<{
  turn: { result: Result; position: Map<number, Player>; nextPlayer: Player };
  focus: { cellId: number };
}>;

let deriveResult = (position: Map<number, Player>): Result => {
  const winningCombos = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const combo of winningCombos) {
    const [a, b, c] = combo;
    if (
      position.has(a) &&
      position.get(a) === position.get(b) &&
      position.get(a) === position.get(c)
    ) {
      return position.get(a)! as Player;
    }
  }
  if (position.size === 9) {
    return "Draw";
  }
  return "Pending";
};

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

export const TicTacToe = clientEntry(
  import.meta.url,
  function TicTacToe(handle: Handle) {
    let currentGameEvt: TicTacToeEventMap["change"]["detail"]["details"] = {
      turn: {
        result: "Pending",
        position: new Map<number, Player>(),
        nextPlayer: "X",
      },
      focus: { cellId: 0 },
    };
    let gameTarget = new TypedEventTarget<TicTacToeEventMap>();
    let dispatch = dispatchCustomEvent.bind(null, {
      target: gameTarget,
      signal: handle.signal,
    });
    let onGame = onCustomEvent.with({
      target: gameTarget,
      initial: currentGameEvt
    });

    return () => (
      <div
        mix={[
          css({
            width: "100%",
            maxWidth: "420px",
            display: "flex",
            flexDirection: "column",
            gap: "36px",
          }),
          onGame("change", ({ detail }) => {
            Object.assign(currentGameEvt, detail.details);
          }),
        ]}
      >
        <div
          mix={[
            css({
              width: "100%",
              aspectRatio: "1/1",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
            }),
            on("click", (evt) => {
              let cellId = Number((evt.target as HTMLButtonElement).value);
              let { position, nextPlayer } = currentGameEvt.turn!;
              let nextPosition = position.set(cellId, nextPlayer);
              let nextFreeCellIdx = cellId;
              while (nextPosition.has(nextFreeCellIdx)) {
                nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
                if (nextFreeCellIdx === cellId) {
                  // We've looped through all cells and found no free cell
                  break;
                }
              }
              dispatch({
                turn: {
                  position: nextPosition,
                  nextPlayer: nextPlayer === "X" ? "O" : "X",
                  result: deriveResult(nextPosition),
                },
                focus: { cellId: nextFreeCellIdx },
              });
            }),
            on("keydown", ({ key, target }) => {
              if (!isArrowKey(key)) return;
              let cellId = Number((target as HTMLButtonElement).value);
              let idxIncrement = arrowKeyIdxIncrementMap[key];
              let nextFreeCellIdx = cellId;
              let boundIdx = idxIncrement < 0 ? 0 : 8;
              let { position } = currentGameEvt.turn!;
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
              dispatch({
                focus: { cellId: nextFreeCellIdx },
              });
            }),
          ]}
        >
          {Array.from({ length: 9 }, (_, index) => (
            <button
              key={index}
              value={index}
              mix={[
                onGame("turn", (evt, button) => {
                  let { position, result } = evt.detail;
                  let cellId = Number(button.value);
                  let isGameEnded = result !== "Pending";
                  button.toggleAttribute(
                    "disabled",
                    position.has(cellId) || isGameEnded,
                  );
                  button.classList.toggle(
                    position.get(cellId)!,
                    position.has(cellId),
                  );
                }),
                onGame("focus", ({ detail }, button) => {
                  if (detail.cellId !== Number(button.value)) return;
                  button.focus();
                }),
                css({
                  width: "calc(100% / 3 - 4px)",
                  aspectRatio: "1/1",
                  "&:disabled": { backgroundColor: "darkgray" },
                  fontSize: "36px",
                  fontWeight: "bold",
                  "&.X": {
                    color: "blue",
                  },
                  "&.O": {
                    color: "red",
                  },
                }),
              ]}
            >
              <onGame.turn
                render={({ detail }) => detail.position.get(index)}
              />
            </button>
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            onGame("turn", ({ detail }, button) => {
              if (detail.result === "Pending") return;
              button.focus();
            }),
            on("click", () => {
              let { position } = currentGameEvt.turn!;
              position.clear();
              dispatch({
                turn: {
                  position,
                  nextPlayer: "X",
                  result: "Pending",
                },
                focus: { cellId: 0 },
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
          <onGame.turn
            render={({ detail: { result } }) => {
              if (result === "Pending") return;
              if (result === "Draw") return "Game is drawn.";
              return `${result} has won!`;
            }}
          />
        </p>
      </div>
    );
  },
);
