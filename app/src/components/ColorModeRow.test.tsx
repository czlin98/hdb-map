import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { ColorModeRow } from "./ColorModeRow";
import { useColorMode } from "../store/color";

beforeEach(() => useColorMode.getState().setMode("none"));

test("a Color by radio group with None, Year, Floors and MRT, the current mode checked", () => {
  useColorMode.getState().setMode("year");
  render(<ColorModeRow />);
  const group = screen.getByRole("radiogroup", { name: "Color by" });
  const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
  expect(radios.map((r) => r.labels![0].textContent)).toEqual(["None", "Year", "Floors", "MRT"]);
  expect(screen.getByRole("radio", { name: "Year" })).toBeChecked();
});

test("choosing a mode sets the store", async () => {
  render(<ColorModeRow />);
  await userEvent.click(screen.getByRole("radio", { name: "Floors" }));
  expect(useColorMode.getState().mode).toBe("floors");
});

test("arrow keys move between the modes", async () => {
  const user = userEvent.setup();
  render(<ColorModeRow />);
  await user.click(screen.getByRole("radio", { name: "None" }));
  await user.keyboard("{ArrowRight}");
  expect(useColorMode.getState().mode).toBe("year");
  await user.keyboard("{ArrowRight}");
  expect(useColorMode.getState().mode).toBe("floors");
});
