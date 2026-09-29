import { App as NonlaApp } from "devnonla-ui";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { initReloadOnStaleDeploy } from "src/common/reloadOnStaleDeploy";
import { initTheme } from "src/common/theme";
import "./index.css";
import { store } from "src/store/store";
import App from "./App";

initTheme();
initReloadOnStaleDeploy();

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <Provider store={store}>
    <NonlaApp>
      <App />
    </NonlaApp>
  </Provider>,
);
