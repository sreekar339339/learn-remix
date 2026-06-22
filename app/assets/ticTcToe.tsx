import {
  attrs,
  clientEntry,
  css,
  on,
  ref,
  type Dispatched,
  type Handle,
} from "remix/ui";
import { SemanticEventTarget } from "./utils/SemanticEventTarget.js";

type Player = "X" | "O";
type Board = Array<Player | null>;
type Result = Player | "Draw" | null;

const interactionType = {
  navigation: "navigation",
  selection: "selection",
} as const;

type InteractionType = typeof interactionType;

type GameEvent = { type: keyof InteractionType };

export const TicTacToe = clientEntry(
  import.meta.url,
  class {
    board: Board = new Array(9).fill(null);
    nextPlayer: Player = "X";
    isFirstMoveMade = false;
    result?: Result;
    gameEvtTarget: SemanticEventTarget<GameEvent>;
    nodeIdToFocus: number | "reset" = 0;
    nodeIdMap = {} as { [cellId: number]: HTMLElement } & {
      reset: HTMLElement;
    };

    static TicTacToe = (handle: Handle) => {
      let game = new this(handle);
      return game.render.bind(game);
    };

    constructor(handle: Handle) {
      this.gameEvtTarget = new SemanticEventTarget<GameEvent>({
        event: { type: "navigation" },
        onChange: async (evt) => {
          if (evt.type === "selection") {
            await handle.update();
          }
          this.focusNode();
        },
        options: { signal: handle.signal },
      });

      handle.queueTask(() =>
        this.gameEvtTarget.dispatchEvent("navigation"),
      );
    }

    render() {
      return (
        <div
          mix={[
            css({
              width: "100%",
              maxWidth: "420px",
              display: "flex",
              flexDirection: "column",
              gap: "36px",
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
              on("click", (event) => this.handleSelection(event)),
              on("keydown", (event) => this.handleNavigation(event)),
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
                  attrs({
                    name: "cell",
                    value: index,
                    disabled: this.board[index] !== null,
                  }),
                  ref((node) => (this.nodeIdMap[index] = node)),
                ]}
                style={{ color: cell === "X" ? "blue" : "red" }}
              >
                {cell}
              </button>
            ))}
          </div>
          <button
            mix={[
              css({ fontSize: "18px", padding: "8px 16px" }),
              attrs({ disabled: !this.isFirstMoveMade }),
              ref((node) => (this.nodeIdMap["reset"] = node)),
              on("click", () => this.handleReset()),
            ]}
          >
            Reset
          </button>
        </div>
      );
    }

    getCellId(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return;
      const eventTargetName = target.getAttribute("name");
      if (eventTargetName !== "cell") return;
      return parseInt(target.getAttribute("value") || "");
    }

    focusNode() {
      this.nodeIdMap[this.nodeIdToFocus].focus();
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
      this.nodeIdToFocus = 0;
    }

    handleSelection(event: Dispatched<PointerEvent, HTMLDivElement>) {
      const cellIdx = this.getCellId(event.target);
      if (cellIdx === undefined) return;
      this.makeSelection(cellIdx);
      if (this.result) {
        this.nodeIdToFocus = "reset";
        this.gameEvtTarget.dispatchEvent("selection");
      } else {
        this.setNextNodeIdToFocus({ type: "selection" });
        this.gameEvtTarget.dispatchEvent("selection");
      }
    }

    handleReset() {
      this.resetGame();
      this.gameEvtTarget.dispatchEvent("selection");
    }

    keyToIdxIncrementMap = {
      ArrowUp: -3,
      ArrowDown: 3,
      ArrowLeft: -1,
      ArrowRight: 1,
    };

    isArrowKey(
      eventKey: unknown,
    ): eventKey is keyof typeof this.keyToIdxIncrementMap {
      return Object.hasOwn(this.keyToIdxIncrementMap, eventKey as string);
    }

    handleNavigation(event: Dispatched<KeyboardEvent, HTMLDivElement>) {
      let eventKey = event.key;
      if (!this.isArrowKey(eventKey)) return;
      const cellIdx = this.getCellId(event.target);
      if (cellIdx === undefined) return;
      this.nodeIdToFocus = cellIdx; // current focus
      this.setNextNodeIdToFocus({
        type: "navigation",
        idxIncrement: this.keyToIdxIncrementMap[eventKey],
      });
      this.gameEvtTarget.dispatchEvent("navigation");
    }

    setNextNodeIdToFocus(
      arg:
        | {
            type: InteractionType["navigation"];
            idxIncrement: number;
          }
        | { type: InteractionType["selection"] },
    ) {
      if (arg.type === "navigation") {
        return this.handleNextNodeInNavigation(arg.idxIncrement);
      }
      this.handleNextNodeInSelection();
    }

    handleNextNodeInNavigation(idxIncrement: number) {
      if (this.nodeIdToFocus == "reset") return;
      let nextFreeCellIdx = this.nodeIdToFocus + idxIncrement;
      let boundIdx = idxIncrement < 0 ? 0 : 8;
      if (
        (boundIdx === 0 && nextFreeCellIdx < boundIdx) ||
        (boundIdx === 8 && nextFreeCellIdx > boundIdx)
      )
        return;
      while (this.board[nextFreeCellIdx]) {
        nextFreeCellIdx += idxIncrement;
        if (
          (boundIdx === 0 && nextFreeCellIdx < boundIdx) ||
          (boundIdx === 8 && nextFreeCellIdx > boundIdx)
        )
          return;
      }
      this.nodeIdToFocus = nextFreeCellIdx;
    }

    handleNextNodeInSelection() {
      if (this.nodeIdToFocus == "reset") return;
      let nextFreeCellIdx = (this.nodeIdToFocus + 1) % 9;
      while (this.board[nextFreeCellIdx]) {
        nextFreeCellIdx = (nextFreeCellIdx + 1) % 9;
        if (nextFreeCellIdx === this.nodeIdToFocus) {
          // We've looped through all cells and found no free cell
          return;
        }
      }
      this.nodeIdToFocus = nextFreeCellIdx;
    }
  }.TicTacToe,
);
