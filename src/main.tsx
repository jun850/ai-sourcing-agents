import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
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
import { atelixMaterialTheme } from "./material-theme";

createRoot(document.getElementById("root")!).render(<StrictMode><ThemeProvider theme={atelixMaterialTheme}><CssBaseline/><App /></ThemeProvider></StrictMode>);
