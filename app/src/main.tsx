import React from "react";
import ReactDOM from "react-dom/client";
import * as maplibregl from "maplibre-gl";
// maplibre-gl v6 computes its worker URL at runtime, which Vite can't bundle (the build
// emits no worker, and the dev server corrupts the raw module). Hand it a Vite-managed,
// self-contained worker URL before any map is created.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import App from "./App";
import "./index.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
