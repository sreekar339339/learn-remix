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
});
