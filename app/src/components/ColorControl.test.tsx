import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { ColorControl } from "./ColorControl";
import { useColorMode } from "../store/color";

beforeEach(() => useColorMode.getState().setMode("none"));

test("desktop button names the mode and the menu picks one", async () => {
  const user = userEvent.setup();
  render(<ColorControl compact={false} />);
  const button = screen.getByRole("button", { name: "Color" });
  expect(button).toHaveTextContent("Color");

  await user.click(button);
  expect(screen.getByText("Color by")).toBeInTheDocument();
  const items = screen.getAllByRole("menuitemradio");
  expect(items.map((i) => i.textContent)).toEqual(["No coloring", "Year completed", "Floors"]);
  expect(screen.getByRole("menuitemradio", { name: "No coloring" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await user.click(screen.getByRole("menuitemradio", { name: "Year completed" }));
  expect(useColorMode.getState().mode).toBe("year");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Color: Year" })).toHaveTextContent("Color: Year");
});

test("the menu works from the keyboard", async () => {
  const user = userEvent.setup();
  render(<ColorControl compact={false} />);
  screen.getByRole("button", { name: "Color" }).focus();

  await user.keyboard("{Enter}");
  expect(screen.getByRole("menu")).toBeInTheDocument();
  // Radix focuses the first item on a keyboard open.
  await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  expect(useColorMode.getState().mode).toBe("floors");

  await user.keyboard("{Enter}");
  expect(screen.getByRole("menu")).toBeInTheDocument();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(useColorMode.getState().mode).toBe("floors");
});

test("compact button is icon-only, with a dot while a mode is on", async () => {
  const user = userEvent.setup();
  render(<ColorControl compact />);
  const button = screen.getByRole("button", { name: "Color" });
  expect(button).toHaveTextContent("");
  expect(screen.queryByTestId("color-on")).not.toBeInTheDocument();

  await user.click(button);
  await user.click(screen.getByRole("menuitemradio", { name: "Floors" }));
  expect(screen.getByRole("button", { name: "Color: Floors" })).toBeInTheDocument();
  expect(screen.getByTestId("color-on")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Color: Floors" }));
  await user.click(screen.getByRole("menuitemradio", { name: "No coloring" }));
  expect(screen.queryByTestId("color-on")).not.toBeInTheDocument();
});
