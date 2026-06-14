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
import { match, P } from "ts-pattern";

type Player = "X" | "O";
type Board = Array<Player | null>;
type Result = Player | "Draw" | null;

type PlayType = "navigation" | "selection";
type GameState =
  | { status: "ended" }
  | { status: "notEnded"; playType: PlayType };

class TicTacToeGame {
  board: Board = new Array(9).fill(null);
  nextPlayer: Player = "X";
  rootNode?: HTMLElement;
  isFirstMoveMade = false;
  result?: Result;
  resetNode?: HTMLElement;
  cellNodes: Array<HTMLElement> = [];
  dispatchEvent: ReturnType<typeof createChangeEventListener<GameState>>;
  cellIdToFocus = 0;
  pendingUpdate?: ReturnType<Handle["update"]>;

  constructor(handle: Handle) {
    this.dispatchEvent = createChangeEventListener<GameState>(
      async (evt) =>
        match(evt.detail)
          .with({ status: "notEnded", playType: "navigation" }, async () => {
            this.focus("cell");
          })
          .with(
            P.union(
              { status: "ended" },
              { status: "notEnded", playType: "selection" },
            ),
            (val) => {
              this.pendingUpdate = handle.update();
              match(val)
                .with({ playType: "selection" }, () => this.focus("cell"))
                .with({ status: "ended" }, () => this.focus("reset"));
            },
          )
          .exhaustive(),
      { signal: handle.signal },
    );

    handle.queueTask(() =>
      this.dispatchEvent({ status: "notEnded", playType: "navigation" }),
    );
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

  async focus(type: "cell" | "reset") {
    await this.pendingUpdate;
    if (type === "cell") {
      this.cellNodes[this.cellIdToFocus].focus();
    } else {
      this.resetNode?.focus();
    }
  }

  makeSelection(cellIdx: number) {
    if (this.board[cellIdx]) return;
    this.board[cellIdx] = this.nextPlayer;
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

  handleSelection(cellIdx: number) {
    this.makeSelection(cellIdx);
    if (this.result) {
      this.dispatchEvent({ status: "ended" });
    } else {
      this.setNextFreeCellIdx({playType: 'selection'});
      this.dispatchEvent({ status: "notEnded", playType: "selection" });
    }
  }

  handleReset() {
    this.resetGame();
    this.cellIdToFocus = 0;
    this.dispatchEvent({
      status: "notEnded",
      playType: "selection",
    });
  }

  rootMix = createMixin<HTMLElement>(() => () => [
    on("click", async (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const eventTargetName = event.target.getAttribute("name");
      if (eventTargetName === null) return;
      if (eventTargetName === "cell") {
        const cellIdx = parseInt(event.target.getAttribute("value") || "");
        this.handleSelection(cellIdx);
      } else if (eventTargetName === "reset") {
        this.handleReset();
      }
    }),
    on("keydown", (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      let setNextFreeCell = (idxIncrement: number) => {
        this.setNextFreeCellIdx({ playType: "navigation", idxIncrement });
        this.dispatchEvent({
          status: "notEnded",
          playType: "navigation",
        });
      };
      match(event.key)
        .with("ArrowUp", () => setNextFreeCell(-3))
        .with("ArrowDown", () => setNextFreeCell(3))
        .with("ArrowLeft", () => setNextFreeCell(-1))
        .with("ArrowRight", () => setNextFreeCell(1));
    }),
  ]);

  setNextFreeCellIdx(
    arg:
      | { playType: "navigation"; idxIncrement: number }
      | { playType: "selection" },
  ) {
    match(arg)
      .with({ playType: "navigation" }, ({ idxIncrement }) => {
        let nextFreeCellIdx = this.cellIdToFocus + idxIncrement;
        let boundIdx = idxIncrement < 0 ? 0 : 8;
        if ((boundIdx === 0 && nextFreeCellIdx < boundIdx) || (boundIdx === 9 && nextFreeCellIdx > boundIdx)) return
        this.cellIdToFocus = nextFreeCellIdx;
      })
      .with({ playType: "selection" }, () => {
        let nextFreeCellIdx = (this.cellIdToFocus + 1) % 9;
        while (this.board[nextFreeCellIdx]) {
          nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
          if (nextFreeCellIdx === this.cellIdToFocus) {
            // We've looped through all cells and found no free cell
            return;
          }
        }
        this.cellIdToFocus = nextFreeCellIdx;
      }).exhaustive();
  }

  cellMix = createMixin<HTMLElement, [index: number]>(() => (index) => [
    attrs({ name: "cell", value: index, disabled: this.board[index] !== null }),
    ref((node) => this.cellNodes.push(node)),
  ]);

  resetMix = createMixin<HTMLElement>(() => () => [
    attrs({ disabled: !this.isFirstMoveMade, name: "reset" }),
    ref((node) => (this.resetNode = node)),
  ]);
}

export const TicTacToe = clientEntry(import.meta.url, TicTacToeGame.TicTacToe);
