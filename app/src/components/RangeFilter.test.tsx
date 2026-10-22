import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { RangeFilter } from "./RangeFilter";
import type { Range } from "../lib/filtering";

const LIMITS: Range = [1960, 2024];

function renderFilter(initial: Range | null = null) {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState(initial);
    return (
      <RangeFilter
        title="Year completed"
        limits={LIMITS}
        step={1}
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
      />
    );
  }
  render(<Harness />);
  return { onChange };
}

const box = (end: "from" | "to") =>
  screen.getByRole("spinbutton", { name: `Year completed, ${end}` }) as HTMLInputElement;
const thumb = (end: "from" | "to") =>
  screen.getByRole("slider", { name: `Year completed, ${end}` });
const resetLink = () => screen.queryByRole("button", { name: "Reset Year completed" });

function type(end: "from" | "to", text: string, commit: "enter" | "blur" = "enter") {
  const input = box(end);
  fireEvent.change(input, { target: { value: text } });
  if (commit === "enter") fireEvent.keyDown(input, { key: "Enter" });
  else fireEvent.blur(input);
}

test("off: the boxes show the limits, the thumbs sit at the ends, and no Reset", () => {
  renderFilter();
  expect(box("from").value).toBe("1960");
  expect(box("to").value).toBe("2024");
  expect(thumb("from")).toHaveAttribute("aria-valuenow", "1960");
  expect(thumb("to")).toHaveAttribute("aria-valuenow", "2024");
  expect(resetLink()).not.toBeInTheDocument();
});

test("a typed value is committed on Enter", () => {
  const { onChange } = renderFilter();
  type("to", "1986");
  expect(onChange).toHaveBeenLastCalledWith([1960, 1986]);
  expect(thumb("to")).toHaveAttribute("aria-valuenow", "1986");
});

test("a typed value is committed on blur", () => {
  const { onChange } = renderFilter();
  type("from", "1975", "blur");
  expect(onChange).toHaveBeenLastCalledWith([1975, 2024]);
});

test("a typed value is clamped to the limits", () => {
  const { onChange } = renderFilter([1980, 2000]);
  type("from", "1900");
  expect(onChange).toHaveBeenLastCalledWith([1960, 2000]);
  type("to", "2100");
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(box("to").value).toBe("2024");
});

test("a typed from above to is pulled down to to", () => {
  const { onChange } = renderFilter([1980, 2000]);
  type("from", "2010");
  expect(onChange).toHaveBeenLastCalledWith([2000, 2000]);
  expect(box("from").value).toBe("2000");
});

test("a typed to below from is pulled up to from", () => {
  const { onChange } = renderFilter([1980, 2000]);
  type("to", "1970");
  expect(onChange).toHaveBeenLastCalledWith([1980, 1980]);
  expect(box("to").value).toBe("1980");
});

test("an empty box reverts to the current value", () => {
  const { onChange } = renderFilter([1980, 2000]);
  type("from", "");
  expect(onChange).not.toHaveBeenCalled();
  expect(box("from").value).toBe("1980");
});

test("a range typed back to the full limits turns the filter off", () => {
  const { onChange } = renderFilter([1980, 2024]);
  type("from", "1960");
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(resetLink()).not.toBeInTheDocument();
});

test("ArrowRight on the from thumb raises it by one and updates its box", () => {
  const { onChange } = renderFilter();
  act(() => thumb("from").focus());
  fireEvent.keyDown(thumb("from"), { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith([1961, 2024]);
  expect(box("from").value).toBe("1961");
});

test("Reset turns the filter off and moves focus to the from thumb", () => {
  const { onChange } = renderFilter([1980, 2000]);
  fireEvent.click(resetLink()!);
  expect(onChange).toHaveBeenLastCalledWith(null);
  expect(resetLink()).not.toBeInTheDocument();
  expect(box("from").value).toBe("1960");
  // Not a number box: on a phone that would open the keyboard.
  expect(thumb("from")).toHaveFocus();
});

test("a unit shows in the title and is spoken in the box labels", () => {
  render(
    <RangeFilter
      title="MRT distance"
      unit={{ symbol: "m", name: "metres" }}
      limits={[15, 3545]}
      step={50}
      value={[15, 500]}
      onChange={() => {}}
    />,
  );
  expect(screen.getByRole("heading")).toHaveTextContent("MRT distance (m)");
  expect(screen.getByRole("group", { name: "MRT distance" })).toBeInTheDocument();
  expect(screen.getByRole("spinbutton", { name: "MRT distance in metres, to" })).toHaveValue(500);
  expect(screen.getByRole("slider", { name: "MRT distance in metres, to" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reset MRT distance" })).toBeInTheDocument();
});

function renderStepped() {
  const onChange = vi.fn();
  function Harness() {
    const [value, setValue] = useState<Range | null>(null);
    return (
      <RangeFilter
        title="MRT distance"
        unit={{ symbol: "m", name: "metres" }}
        limits={[15, 3545]}
        step={50}
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
      />
    );
  }
  render(<Harness />);
  return { onChange };
}

const stepped = (role: "slider" | "spinbutton", end: "from" | "to") =>
  screen.getByRole(role, { name: `MRT distance in metres, ${end}` });

test("a step moves the thumbs by whole steps between the data's ends", () => {
  const { onChange } = renderStepped();
  expect(stepped("spinbutton", "from")).toHaveValue(15);
  expect(stepped("spinbutton", "to")).toHaveValue(3545);
  // Off the grid at the data's minimum, the first step lands on the next multiple.
  fireEvent.keyDown(stepped("slider", "from"), { key: "ArrowRight" });
  expect(onChange).toHaveBeenLastCalledWith([50, 3545]);
  // The track's rounded end clamps back to the data's, which turns the filter off.
  fireEvent.keyDown(stepped("slider", "from"), { key: "Home" });
  expect(onChange).toHaveBeenLastCalledWith(null);
});

test("with a step, a typed value stays exact and clamps to the data's ends", () => {
  const { onChange } = renderStepped();
  fireEvent.change(stepped("spinbutton", "to"), { target: { value: "480" } });
  fireEvent.keyDown(stepped("spinbutton", "to"), { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith([15, 480]);
  fireEvent.change(stepped("spinbutton", "to"), { target: { value: "3549" } });
  fireEvent.keyDown(stepped("spinbutton", "to"), { key: "Enter" });
  expect(onChange).toHaveBeenLastCalledWith(null);
});
