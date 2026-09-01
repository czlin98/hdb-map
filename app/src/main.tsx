import React from "react";
import ReactDOM from "react-dom/client";
import * as maplibregl from "maplibre-gl";
// maplibre-gl v6 computes its worker URL dynamically, which Vite/Rollup cannot
// statically bundle (no worker asset is emitted for the build, and the dev
// server corrupts the raw worker module). Hand it a Vite-managed worker URL,
// bundled self-contained via `?worker&url`, before any map is created.
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import App from "./App";
import "./index.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
