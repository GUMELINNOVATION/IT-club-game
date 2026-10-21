import React from "react";
import ReactDOM from "react-dom/client";
import App from "./ui/App";
import { LanguageProvider } from "./ui/i18n";
import "./ui/styles.css";
import "./ui/readability.css";
import "./ui/language.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider><App /></LanguageProvider>
  </React.StrictMode>
);
