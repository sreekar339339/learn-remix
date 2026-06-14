import {
  attrs,
  clientEntry,
  createMixin,
  css,
  on,
  ref,
  type Handle,
} from "remix/ui";
import { createChangeEventListener } from "../utils/events.ts";
import { match } from "ts-pattern";

type Player = "X" | "O";
type Board = Array<Player | null>;
type Result = Player | "Draw" | null;

type GameState =
  | { kind: "focus"; id: number }
  | { kind: "board"; status: "ended" | "notEnded" };

class TicTacToeGame {
  board: Board = new Array(9).fill(null);
  nextPlayer: Player = "X";
  rootNode: HTMLElement | null = null;
  isFirstMoveMade = false;
  result: Result = null;
  resetNode: HTMLElement | null = null;
  cellNodes: Array<HTMLElement> = [];
  dispatchEvent: ReturnType<typeof createChangeEventListener<GameState>>;

  constructor(handle: Handle) {
    let pendingUpdate: ReturnType<Handle["update"]>;

    this.dispatchEvent = createChangeEventListener<GameState>(
      async (evt) =>
        match(evt.detail)
          .with({ kind: "focus" }, async ({ id }) => {
            await pendingUpdate;
            this.cellNodes[id].focus();
          })
          .with({ kind: "board" }, (val) => {
            pendingUpdate = handle.update();
            match(val).with({ status: "ended" }, () => this.resetNode?.focus());
          }),
      { signal: handle.signal },
    );

    handle.queueTask(() => this.dispatchEvent({ kind: "focus", id: 0 }));
  }

  render = () => (
    <div
      mix={[
        css({
          width: "100%",
          maxWidth: "420px",
          display: "flex",
          flexDirection: "column",
          gap: "36px",
        }),
        this.rootMix(),
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
        ]}
      >
        {this.board.map((cell, index) => (
          <button
            key={index}
            mix={[
              css({
                width: "calc(100% / 3 - 4px)",
                aspectRatio: "1/1",
                "&:disabled": { backgroundColor: "darkgray" },
                fontSize: "36px",
                fontWeight: "bold",
              }),
              this.cellMix(index),
            ]}
            style={{ color: cell === "X" ? "blue" : "red" }}
          >
            {cell}
          </button>
        ))}
      </div>
      <button
        mix={[this.resetMix(), css({ fontSize: "18px", padding: "8px 16px" })]}
      >
        Reset
      </button>
    </div>
  );

  static TicTacToe(handle: Handle) {
    let game = new TicTacToeGame(handle);
    return game.render;
  }

  makeMove(index: number) {
    if (this.board[index]) return;
    this.board[index] = this.nextPlayer;
    this.nextPlayer = this.nextPlayer === "X" ? "O" : "X";
    this.result = this.deriveResult(this.board);
    if (!this.isFirstMoveMade) {
      this.isFirstMoveMade = true;
    }
  }

  deriveResult(board: Board): Result {
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
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return board[a];
      }
    }
    if (board.every((cell) => cell !== null)) {
      return "Draw";
    }
    return null;
  }

  resetGame() {
    this.board = new Array(9).fill(null);
    this.nextPlayer = "X";
    this.isFirstMoveMade = false;
    this.result = null;
  }

  nextFreeCell(cellIdx: number) {
    let nextFreeCellIdx = (cellIdx + 1) % 9;
    while (this.board[nextFreeCellIdx] !== null) {
      nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
      if (nextFreeCellIdx === cellIdx) {
        // We've looped through all cells and found no free cell
        return;
      }
    }
    return nextFreeCellIdx;
  }

  handleMove(cellIdx: number) {
    this.makeMove(cellIdx);
    if (this.result) {
      this.dispatchEvent({ kind: "board", status: "ended" });
    } else {
      this.dispatchEvent({ kind: "board", status: "notEnded" });
      this.dispatchEvent({
        kind: "focus",
        id: this.nextFreeCell(cellIdx) || 0,
      });
    }
  }

  handleReset() {
    this.resetGame();
    this.dispatchEvent({
      kind: "board",
      status: "notEnded",
    });
    this.dispatchEvent({ kind: "focus", id: 0 });
  }

  rootMix = createMixin<HTMLElement>(() => () => [
    on("click", async (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const eventTargetName = event.target.getAttribute("name");
      if (eventTargetName === null) return;
      if (eventTargetName === "move") {
        const cellIdx = parseInt(event.target.getAttribute("value") || "");
        this.handleMove(cellIdx);
      } else if (eventTargetName === "reset") {
        this.handleReset();
      }
    }),
    on("keydown", (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const cellIdCurrentlyOnFocus = parseInt(
        event.target?.getAttribute("value") || "",
      );
      let nextFreeCellIdx: number | null = null;
      if (event.key === "ArrowUp") {
        nextFreeCellIdx = cellIdCurrentlyOnFocus - 3;
        while (nextFreeCellIdx >= 0 && this.board[nextFreeCellIdx]) {
          nextFreeCellIdx -= 3;
        }
      }
      if (event.key === "ArrowDown") {
        nextFreeCellIdx = cellIdCurrentlyOnFocus + 3;
        while (nextFreeCellIdx < 9 && this.board[nextFreeCellIdx]) {
          nextFreeCellIdx += 3;
        }
      }
      if (event.key === "ArrowLeft") {
        nextFreeCellIdx = cellIdCurrentlyOnFocus - 1;
        while (nextFreeCellIdx >= 0 && this.board[nextFreeCellIdx]) {
          nextFreeCellIdx--;
        }
      }
      if (event.key === "ArrowRight") {
        nextFreeCellIdx = cellIdCurrentlyOnFocus + 1;
        while (nextFreeCellIdx < 9 && this.board[nextFreeCellIdx]) {
          nextFreeCellIdx++;
        }
      }
      if (nextFreeCellIdx === null) return;
      this.dispatchEvent({
        kind: "focus",
        id: nextFreeCellIdx,
      });
    }),
  ]);

  cellMix = createMixin<HTMLElement, [index: number]>(() => (index) => [
    attrs({ name: "move", value: index, disabled: this.board[index] !== null }),
    ref((node) => this.cellNodes.push(node)),
  ]);

  resetMix = createMixin<HTMLElement>(() => () => [
    attrs({ disabled: !this.isFirstMoveMade, name: "reset" }),
    ref((node) => (this.resetNode = node)),
  ]);
}

export const TicTacToe = clientEntry(import.meta.url, TicTacToeGame.TicTacToe);
