import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./motion.css";
import "./hero-type.css";
import "./sticky-nav.css";
import "./responsive-a11y.css";
import "./supplier-intake.css";
import "./atelix-sourcing-section.css";
import "./landing/primitives.css";
import "./landing/journey.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
