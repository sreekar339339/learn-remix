import {
  attrs,
  clientEntry,
  createMixin,
  css,
  on,
  ref,
  type Handle,
} from "remix/ui";

export const TicTacToe = clientEntry(
  import.meta.url,
  function TicTacToe(handle: Handle) {
    let game = new TicTacToeGame(handle.update);
    return () => (
      <>
        <div
          mix={[
            css({
              width: "100%",
              aspectRatio: "1/1",
              display: "flex",
              flexWrap: "wrap",
              gap: "4px",
            }),
            game.rootMix(),
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
      </>
    );
  },
);

class TicTacToeGame {
  board: Array<string> = new Array(9).fill("");
  currentPlayer: "X" | "O" = "X";
  refreshUi: Handle["update"];
  rootNode: HTMLElement | null = null;
  firstMoveMade: boolean = false;
  cellIdCurrentlyOnFocus: number = null

  constructor(update: Handle["update"]) {
    this.refreshUi = update;
  }

  makeMove(index: number) {
    if (!this.firstMoveMade) {
      this.firstMoveMade = true;
    }
    if (this.board[index] !== "") {
      return;
    }
    this.board[index] = this.currentPlayer;
    this.currentPlayer = this.currentPlayer === "X" ? "O" : "X";
    let winner = this.findWinner(this.board);
    if (winner) {
      // Handle winner logic
    }
  }

  findWinner(board: Array<string>): string | null {
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
    return null;
  }

  shiftFocusOnMove(cellIdx: number) {
    const nextIndex = (cellIdx + 1) % 9;
    this.focusCell(nextIndex);
  }

  focusCell(cellIdx: number) {
    if (cellIdx < 0 || cellIdx > 8) return
    this.rootNode?.dispatchEvent(new FocusChangeEvent(cellIdx));
    this.cellIdCurrentlyOnFocus = cellIdx;
  }

  rootMix = createMixin<HTMLElement>((handle) => () => [
    on("click", async (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const cellIdx = parseInt(event.target.dataset.cellIdx);
      this.makeMove(cellIdx);
      await this.refreshUi();
      this.shiftFocusOnMove(cellIdx);
    }),
    ref((node) => {
      this.rootNode = node;
      handle.queueTask(() => {
        this.focusCell(0);
        document.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowUp') {

            this.focusCell(this.cellIdCurrentlyOnFocus - 3)
          }
          if (event.key === 'ArrowDown') {
            this.focusCell(this.cellIdCurrentlyOnFocus + 3)
          }
          if (event.key === 'ArrowLeft') {
            this.focusCell(this.cellIdCurrentlyOnFocus - 1)
          }
          if (event.key === 'ArrowRight') {
            this.focusCell(this.cellIdCurrentlyOnFocus + 1)
          }
        })
      });
    }),
  ]);

  cellMix = createMixin<HTMLElement, [index: number]>((handle) => (index) => [
    attrs({ "data-cell-idx": index, disabled: this.board[index] !== "" }),
    ref((node) => {
      handle.queueTask(() => {
        this.rootNode?.addEventListener(focusChangeEventType, (e) => {
          if (e.cellIdToFocus === index) {
            node.focus();
          }
        });
      });
    }),
  ]);

  resetMix = createMixin<HTMLElement>(() => () => [
    on("click", async () => {
      this.board = new Array(9).fill("");
      this.currentPlayer = "X";
      this.firstMoveMade = false;
      await this.refreshUi();
      this.focusCell(0);
    }),
    attrs({ disabled: !this.firstMoveMade }),
  ]);
}

let focusChangeEventType = "focusChangeEventType" as const;

declare global {
  interface HTMLElementEventMap {
    [focusChangeEventType]: FocusChangeEvent;
  }
}

class FocusChangeEvent extends Event {
  cellIdToFocus: number;
  constructor(cellIdToFocus: number) {
    super(focusChangeEventType);
    this.cellIdToFocus = cellIdToFocus;
  }
}
