import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { render } from "remix/ui/test";

import { TicTacToeCustomEvents } from "./ticTacToe.tsx";

describe("TicTacToeCustomEvents", () => {
  it("renders the seeded initial game state and explicitly dispatches initial focus", async (t) => {
    let result = render(<TicTacToeCustomEvents />);
    t.after(() => result.cleanup());

    await result.act(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    );

    let firstCell = result.$("button[value='0']") as HTMLButtonElement;
    let status = result.$("p") as HTMLParagraphElement;

    assert.equal(firstCell.textContent, "");
    assert.equal(status.textContent, "Game in progress");
    assert.equal(document.activeElement, firstCell);
  });

  it("focuses the reset button when the game ends", async (t) => {
    let result = render(<TicTacToeCustomEvents />);
    t.after(() => result.cleanup());

    await result.act(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    );

    let clickCell = async (cellId: number) => {
      let cell = result.$(`button[value='${cellId}']`) as HTMLButtonElement;
      await result.act(() => cell.click());
    };

    await clickCell(0);
    await clickCell(3);
    await clickCell(1);
    await clickCell(4);
    await clickCell(2);

    let reset = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Reset",
    )!;
    let status = result.$("p") as HTMLParagraphElement;

    assert.equal(status.textContent, "X has won!");
    assert.equal(document.activeElement?.textContent, reset.textContent);
    assert.equal(document.activeElement?.getAttribute("value"), null);

    await result.act(() => reset.click());
    await result.act(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    );

    let firstCell = result.$("button[value='0']") as HTMLButtonElement;
    status = result.$("p") as HTMLParagraphElement;

    assert.equal(status.textContent, "Game in progress");
    assert.equal(
      document.activeElement?.getAttribute("value"),
      firstCell.value,
    );
  });
});
