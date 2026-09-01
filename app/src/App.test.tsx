import { render, screen } from "@testing-library/react";
import App from "./App";

test("App renders", () => {
  render(<App />);
  expect(screen.getByRole("main", { name: "HDB Map" })).toBeInTheDocument();
});
