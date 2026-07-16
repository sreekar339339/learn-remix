import * as assert from "remix/assert";
import { describe, it } from "remix/test";
import { render } from "remix/ui/test";

import { TicTacToeCustomEvents } from "./ticTacToeCustomEvents.tsx";

describe("TicTacToeCustomEvents", () => {
  it("focuses the first cell from the dispatched initial event", async (t) => {
    let result = render(<TicTacToeCustomEvents />);
    t.after(() => result.cleanup());

    await result.act(
      () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    );

    let firstCell = result.$("button[value='0']") as HTMLButtonElement;
    assert.equal(document.activeElement, firstCell);
  });
});
