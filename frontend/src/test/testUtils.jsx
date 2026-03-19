import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import App from "../App";

export function renderApp(initialEntries = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>,
  );
}
