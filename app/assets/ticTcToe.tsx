import { clientEntry, css, on, TypedEventTarget, type Handle } from "remix/ui";
import {
  dispatchCustomEvent,
  type CustomEventMap,
} from "./utils/customEvent.ts";
import { onTarget } from "./utils/onTarget.ts";

type Player = "X" | "O";
type Result = Player | "Draw" | "Pending";
type TicTacToeEventMap = CustomEventMap<{
  status: { result: Result; position: Map<number, Player>; nextPlayer: Player };
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

let keyToIdxIncrementMap = {
  ArrowUp: -3,
  ArrowDown: 3,
  ArrowLeft: -1,
  ArrowRight: 1,
};

let isArrowKey = (
  eventKey: unknown,
): eventKey is keyof typeof keyToIdxIncrementMap => {
  return Object.hasOwn(keyToIdxIncrementMap, eventKey as string);
};

export const TicTacToe = clientEntry(
  import.meta.url,
  function TicTacToe(handle: Handle) {
    let gameTarget = new TypedEventTarget<TicTacToeEventMap>();
    let dispatch = dispatchCustomEvent.bind(null, {
      target: gameTarget,
      signal: handle.signal,
    });
    let onGameEvt = onTarget.with({ target: gameTarget });
    let currentGameEvt: TicTacToeEventMap["change"]["detail"]["detail"] = {
      status: {
        result: "Pending",
        position: new Map<number, Player>(),
        nextPlayer: "X",
      },
      focus: { cellId: 0 },
    };
    handle.queueTask(() => {
      dispatch(currentGameEvt);
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
          onGameEvt("change", ({ detail }) => {
            if (typeof detail.type == "string") {
              Object.assign(currentGameEvt, { [detail.type]: detail.detail });
            } else {
              Object.assign(currentGameEvt, detail.detail);
            }
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
              let { position, nextPlayer } = currentGameEvt.status!;
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
                status: {
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
              let idxIncrement = keyToIdxIncrementMap[key];
              let nextFreeCellIdx = cellId;
              let boundIdx = idxIncrement < 0 ? 0 : 8;
              let { position } = currentGameEvt.status!;
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
                onGameEvt("status", (evt, button) => {
                  let { position } = evt.detail;
                  let cellId = Number(button.value);
                  if (position.has(cellId)) {
                    button.textContent = position.get(cellId)!;
                    button.setAttribute("disabled", "true");
                    button.classList.add(position.get(cellId)!);
                  } else {
                    button.textContent = "";
                    button.removeAttribute("disabled");
                    button.classList.remove("X", "O");
                  }
                }),
                onGameEvt("focus", ({ detail }, button) => {
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
            />
          ))}
        </div>
        <button
          mix={[
            css({ fontSize: "18px", padding: "8px 16px" }),
            onGameEvt("status", ({ detail }, button) => {
              if (detail.result === "Pending") return;
              button.focus();
            }),
            on("click", () => {
              let { position } = currentGameEvt.status!;
              position.clear();
              dispatch({
                status: {
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
            onGameEvt("status", ({ detail: { result } }, el) => {
              if (result === "Pending") return;
              let content =
                result === "Draw" ? "Game is drawn." : `${result} has won!`;
              el.textContent = content;
            }),
          ]}
        ></p>
      </div>
    );
  },
);
