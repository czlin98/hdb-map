import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { FlatTypeFilter } from "./FlatTypeFilter";
import type { FlatTypeGroup } from "../lib/filtering";

function renderFilter(initial: { sold?: string[]; rental?: string[] } = {}) {
  const onToggle = vi.fn();
  const onReset = vi.fn();
  function Harness() {
    const [sold, setSold] = useState(initial.sold ?? []);
    const [rental, setRental] = useState(initial.rental ?? []);
    return (
      <FlatTypeFilter
        sold={sold}
        rental={rental}
        onToggle={(group: FlatTypeGroup, type: string) => {
          onToggle(group, type);
          const set = group === "sold" ? setSold : setRental;
          set((s) => (s.includes(type) ? s.filter((t) => t !== type) : [...s, type]));
        }}
        onReset={() => {
          onReset();
          setSold([]);
          setRental([]);
        }}
      />
    );
  }
  render(<Harness />);
  return { onToggle, onReset };
}

const chip = (group: "Sold" | "Rental", label: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", {
    name: `${group} ${label}`,
  });

test("lists the sold and rental types in the details panel's order", () => {
  renderFilter();
  const labels = (group: string) =>
    within(screen.getByRole("group", { name: group }))
      .getAllByRole("button")
      .map((b) => b.textContent);
  expect(labels("Sold")).toEqual([
    "1-Room",
    "2-Room",
    "3-Room",
    "4-Room",
    "5-Room",
    "Executive",
    "Multi-Generation",
    "Studio Apartment",
  ]);
  expect(labels("Rental")).toEqual(["1-Room", "2-Room", "3-Room", "Other"]);
});

test("each chip's name includes its group, so the shared labels stay distinct", () => {
  renderFilter();
  const names = screen
    .getAllByRole("button", { pressed: false })
    .map((b) => b.getAttribute("aria-label"));
  expect(new Set(names).size).toBe(names.length);
  expect(names).toContain("Rental 1-Room");
});

test("a chip toggles its own group's type", () => {
  const { onToggle } = renderFilter();
  fireEvent.click(chip("Rental", "3-Room"));
  expect(onToggle).toHaveBeenLastCalledWith("rental", "3room");
  expect(chip("Rental", "3-Room")).toHaveAttribute("aria-pressed", "true");
  expect(chip("Sold", "3-Room")).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(chip("Rental", "3-Room"));
  expect(chip("Rental", "3-Room")).toHaveAttribute("aria-pressed", "false");
});

test("reset shows only while a chip is on, clears both groups, and keeps focus in the filter", () => {
  const { onReset } = renderFilter({ rental: ["other_room"] });
  fireEvent.click(screen.getByRole("button", { name: "Reset Flat types" }));
  expect(onReset).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Reset Flat types" })).not.toBeInTheDocument();
  expect(chip("Sold", "1-Room")).toHaveFocus();
});

test("the filter is a group named by its title", () => {
  renderFilter();
  expect(screen.getByRole("group", { name: "Flat types" })).toBeInTheDocument();
});
