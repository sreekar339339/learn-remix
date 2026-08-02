import * as assert from "remix/assert";
import { it } from "remix/test";
import { render } from "remix/ui/test";
import { KanbanBoard } from "./kanbanBoard.tsx";

it("routes a deep card update only to its card and owning column", async (t) => {
  let result = render(<KanbanBoard />);
  t.after(() => result.cleanup());

  let backlog = result.$(
    '[aria-label="Backlog projection"]',
  ) as HTMLOutputElement;
  let building = result.$(
    '[aria-label="Building projection"]',
  ) as HTMLOutputElement;
  let design = result.$(
    '[aria-label="Review interaction design"]',
  ) as HTMLElement;
  let metrics = result.$(
    '[aria-label="Define success metrics"]',
  ) as HTMLElement;
  let routing = result.$(
    '[aria-label="Prototype deep patch routing"]',
  ) as HTMLElement;

  assert.equal(backlog.textContent, "0 urgent · projected 1×");
  assert.equal(building.textContent, "1 urgent · projected 1×");
  assert.match(design.textContent ?? "", /Normal · projected 1×/);
  assert.match(metrics.textContent ?? "", /Normal · projected 1×/);
  assert.match(routing.textContent ?? "", /Urgent · projected 1×/);

  let toggle = result.$(
    '[aria-label="Toggle Review interaction design urgency"]',
  ) as HTMLButtonElement;
  await result.act(() => toggle.click());
  await result.act(() => Promise.resolve());

  backlog = result.$(
    '[aria-label="Backlog projection"]',
  ) as HTMLOutputElement;
  building = result.$(
    '[aria-label="Building projection"]',
  ) as HTMLOutputElement;
  design = result.$(
    '[aria-label="Review interaction design"]',
  ) as HTMLElement;
  metrics = result.$(
    '[aria-label="Define success metrics"]',
  ) as HTMLElement;
  routing = result.$(
    '[aria-label="Prototype deep patch routing"]',
  ) as HTMLElement;

  assert.equal(backlog.textContent, "1 urgent · projected 2×");
  assert.equal(building.textContent, "1 urgent · projected 1×");
  assert.match(design.textContent ?? "", /Urgent · projected 2×/);
  assert.match(metrics.textContent ?? "", /Normal · projected 1×/);
  assert.match(routing.textContent ?? "", /Urgent · projected 1×/);
});
