import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./Popup.js";
import "@meetcat/settings-ui/styles.css";
import "./extension.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Popup />
    </StrictMode>
  );
}
