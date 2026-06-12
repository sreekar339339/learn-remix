import {
  addEventListeners,
  attrs,
  clientEntry,
  createMixin,
  css,
  on,
  ref,
  TypedEventTarget,
  type Handle,
} from "remix/ui";

export const TicTacToe = clientEntry(
  import.meta.url,
  function TicTacToe(handle: Handle) {
    let game = new TicTacToeGame();

    addEventListeners(game, handle.signal, {
      change(e) {
        if (e.details?.kind === "board") {
          handle.update();
        }
      },
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
          game.rootMix(),
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
          {game.board.map((cell, index) => (
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
                game.cellMix(index),
              ]}
              style={{ color: cell === "X" ? "blue" : "red" }}
            >
              {cell}
            </button>
          ))}
        </div>
        <button
          mix={[
            game.resetMix(),
            css({ fontSize: "18px", padding: "8px 16px" }),
          ]}
        >
          Reset
        </button>
      </div>
    );
  },
);

type Player = "X" | "O";
type Board = Array<Player | null>;
type Result = Player | "Draw" | null;

interface GameEventMap {
  change: GameEvent;
}

type GameEventDetails =
  | { kind: "focus"; id: number }
  | { kind: "board"; result: Result }
  | { kind: "board"; nextPlayer: Player };

class GameEvent extends Event {
  details?: GameEventDetails;
  constructor(type: keyof GameEventMap, details?: GameEventDetails) {
    super(type);
    this.details = details;
  }
}

class TicTacToeGame extends TypedEventTarget<GameEventMap> {
  board: Board = new Array(9).fill(null);
  nextPlayer: Player = "X";
  rootNode: HTMLElement | null = null;
  isFirstMoveMade = false;
  result: Result = null;

  constructor() {
    super();
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
      this.dispatchEvent(
        new GameEvent("change", { kind: "board", result: this.result }),
      );
    } else {
      this.dispatchEvent(
        new GameEvent("change", {
          kind: "board",
          nextPlayer: this.nextPlayer,
        }),
      );
      this.dispatchEvent(
        new GameEvent("change", {
          kind: "focus",
          id: this.nextFreeCell(cellIdx) || 0,
        }),
      );
    }
  }

  handleReset() {
    this.resetGame();
    this.dispatchEvent(
      new GameEvent("change", {
        kind: "board",
        nextPlayer: this.nextPlayer,
      }),
    );
    this.dispatchEvent(new GameEvent("change", { kind: "focus", id: 0 }));
  }

  rootMix = createMixin<HTMLElement>((handle) => () => [
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
      this.dispatchEvent(
        new GameEvent("change", {
          kind: "focus",
          id: nextFreeCellIdx,
        }),
      );
    }),
  ]);

  cellMix = createMixin<HTMLElement, [index: number]>((handle) => (index) => [
    attrs({ name: "move", value: index, disabled: this.board[index] !== null }),
    ref((node) => {
      if (index === 1) {
        node.focus();
      }
      this.addEventListener("change", (e) => {
        if (e.details?.kind === "focus" && e.details.id === index) {
          handle.queueTask(() => node.focus())
        }
      });
    }),
  ]);

  resetMix = createMixin<HTMLElement>(() => () => [
    attrs({ disabled: !this.isFirstMoveMade, name: "reset" }),
    ref((node) => {
      this.addEventListener("change", (e) => {
        if (e.details?.kind === "board" && "result" in e.details) {
          node.focus();
        }
      });
    }),
  ]);
}
