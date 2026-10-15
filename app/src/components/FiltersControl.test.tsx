import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { FiltersControl } from "./FiltersControl";
import { useFilters } from "../store/filters";
import { sampleIndex, sampleTowns } from "../test/fixtures";
import type { BlockFeature } from "../types/contract";

beforeEach(() => useFilters.getState().clearAll());

function renderControl(features: BlockFeature[] = sampleIndex.features) {
  const onEscape = vi.fn();
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button>Elsewhere</button>
        <button onClick={() => setOpen(false)}>Close from elsewhere</button>
        <FiltersControl
          open={open}
          onOpenChange={setOpen}
          features={features}
          towns={sampleTowns}
          shown={2}
          total={2}
          bottomInset={0}
          onEscape={onEscape}
        />
      </>
    );
  }
  render(<Harness />);
  return { onEscape };
}

const panel = () => screen.queryByRole("dialog", { name: "Filters" });

test("the button reads Filters, with a badge counting the filters that are on", () => {
  renderControl();
  const button = screen.getByRole("button", { name: "Filters" });
  expect(button).toHaveTextContent(/^Filters$/);
  expect(button.querySelectorAll("svg")).toHaveLength(2); // filter icon, chevron

  act(() => {
    useFilters.getState().toggleTown("BEDOK");
    useFilters.getState().setRange("year", [1980, 1999]);
  });
  const withBadge = screen.getByRole("button", { name: "Filters, 2 on" });
  expect(withBadge).toHaveTextContent("Filters2");
  // The badge takes the chevron's place, so the button keeps its width.
  expect(withBadge.querySelectorAll("svg")).toHaveLength(1);
});

test("the button opens the panel: filter list, count at its foot", async () => {
  const user = userEvent.setup();
  renderControl();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  const dialog = panel()!;
  expect(within(dialog).getByRole("heading", { name: "Filters" })).toBeInTheDocument();
  expect(within(dialog).getByRole("group", { name: "Year completed" })).toBeInTheDocument();
  expect(within(dialog).getByRole("status")).toHaveTextContent("Showing 2 of 2 blocks");
});

test("a click outside leaves the panel open; Escape and the button close it", async () => {
  const user = userEvent.setup();
  renderControl();
  const button = screen.getByRole("button", { name: "Filters" });
  await user.click(button);
  await user.click(screen.getByRole("button", { name: "Elsewhere" }));
  expect(panel()).toBeInTheDocument();

  await user.keyboard("{Escape}");
  expect(panel()).not.toBeInTheDocument();

  await user.click(button);
  expect(panel()).toBeInTheDocument();
  await user.click(button);
  expect(panel()).not.toBeInTheDocument();
});

test("Escape returns focus to Filters only from inside the panel, and reports itself", async () => {
  const user = userEvent.setup();
  const { onEscape } = renderControl();
  const button = screen.getByRole("button", { name: "Filters" });
  await user.click(button);
  await user.click(screen.getByRole("button", { name: /^Town/ }));
  await user.keyboard("{Escape}");
  expect(button).toHaveFocus();
  expect(onEscape).toHaveBeenCalledTimes(1);

  // From outside, such as the search box, focus stays put.
  await user.click(button);
  const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
  await user.click(elsewhere);
  await user.keyboard("{Escape}");
  expect(panel()).not.toBeInTheDocument();
  expect(elsewhere).toHaveFocus();
});

test("the button is disabled until the index has loaded", () => {
  renderControl([]);
  expect(screen.getByRole("button", { name: "Filters" })).toBeDisabled();
});

// The Color menu closes the panel as it opens; a focus move back to Filters would dismiss it.
test("closing from elsewhere leaves focus where it is", async () => {
  const user = userEvent.setup();
  renderControl();
  await user.click(screen.getByRole("button", { name: "Filters" }));
  const elsewhere = screen.getByRole("button", { name: "Close from elsewhere" });
  await user.click(elsewhere);
  expect(panel()).not.toBeInTheDocument();
  expect(elsewhere).toHaveFocus();
});
