import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { TownFilter } from "./TownFilter";
import { sampleIndex } from "../test/fixtures";
import type { Town } from "../types/contract";

// Out of name order, like towns.json (sorted by town code).
const TOWNS: Town[] = [
  { town: "BEDOK", town_slug: "bedok", town_code: "BD" },
  { town: "BUKIT BATOK", town_slug: "bukit-batok", town_code: "BB" },
  { town: "ANG MO KIO", town_slug: "ang-mo-kio", town_code: "AMK" },
];

function renderFilter(initial: string[] = []) {
  const onToggle = vi.fn();
  const onReset = vi.fn();
  function Harness() {
    const [selected, setSelected] = useState(initial);
    return (
      <TownFilter
        towns={TOWNS}
        features={sampleIndex.features}
        selected={selected}
        onToggle={(town) => {
          onToggle(town);
          setSelected((s) => (s.includes(town) ? s.filter((t) => t !== town) : [...s, town]));
        }}
        onReset={() => {
          onReset();
          setSelected([]);
        }}
      />
    );
  }
  render(<Harness />);
  return { onToggle, onReset };
}

const disclosure = () => screen.getByRole("button", { name: /^Town/ });
const resetLink = () => screen.queryByRole("button", { name: "Reset town" });

function townRows() {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((li) => li.textContent);
}

test("folded by default, naming the current choice", () => {
  renderFilter();
  expect(disclosure()).toHaveAccessibleName("Town Any");
  expect(disclosure()).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

test("expanding lists every town by name, with its block count", () => {
  renderFilter();
  fireEvent.click(disclosure());
  expect(disclosure()).toHaveAttribute("aria-expanded", "true");
  expect(townRows()).toEqual(["ANG MO KIO1", "BEDOK1", "BUKIT BATOK0"]);
});

test("ticking a town toggles it, and a selected town is checked", () => {
  const { onToggle } = renderFilter(["ANG MO KIO"]);
  fireEvent.click(disclosure());
  expect(screen.getByRole("checkbox", { name: /ANG MO KIO/ })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const bedok = screen.getByRole("checkbox", { name: /BEDOK/ });
  expect(bedok).toHaveAttribute("aria-checked", "false");
  fireEvent.click(bedok);
  expect(onToggle).toHaveBeenCalledWith("BEDOK");
  expect(bedok).toHaveAttribute("aria-checked", "true");
});

test("the whole row toggles its town", () => {
  const { onToggle } = renderFilter();
  fireEvent.click(disclosure());
  fireEvent.click(screen.getByText("BUKIT BATOK"));
  expect(onToggle).toHaveBeenCalledWith("BUKIT BATOK");
});

test("the summary names one or two towns in name order, then counts them", () => {
  renderFilter(["BEDOK"]);
  expect(disclosure()).toHaveAccessibleName("Town BEDOK");
  fireEvent.click(disclosure());
  fireEvent.click(screen.getByRole("checkbox", { name: /ANG MO KIO/ }));
  expect(disclosure()).toHaveAccessibleName("Town ANG MO KIO, BEDOK");
  fireEvent.click(screen.getByRole("checkbox", { name: /BUKIT BATOK/ }));
  expect(disclosure()).toHaveAccessibleName("Town 3 towns");
});

test("the summary truncates instead of wrapping", () => {
  renderFilter(["ANG MO KIO", "BUKIT BATOK"]);
  expect(screen.getByText("ANG MO KIO, BUKIT BATOK")).toHaveClass("truncate");
});

test("Reset shows only with a selection, clears it, and focuses the row", () => {
  const { onReset } = renderFilter();
  expect(resetLink()).not.toBeInTheDocument();
  fireEvent.click(disclosure());
  fireEvent.click(screen.getByRole("checkbox", { name: /BEDOK/ }));
  fireEvent.click(resetLink()!);
  expect(onReset).toHaveBeenCalledTimes(1);
  expect(resetLink()).not.toBeInTheDocument();
  expect(disclosure()).toHaveFocus();
});

test("counts are totals, not narrowed by the selection", () => {
  renderFilter(["BEDOK"]);
  fireEvent.click(disclosure());
  expect(townRows()).toEqual(["ANG MO KIO1", "BEDOK1", "BUKIT BATOK0"]);
});
