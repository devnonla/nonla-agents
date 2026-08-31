import { ConfigProvider } from "antd";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { antdModalConfig, antdPopoverConfig, antdTheme } from "src/antd/theme";
import { initReloadOnStaleDeploy } from "src/common/reloadOnStaleDeploy";
import { initScrollbarHover } from "src/common/scrollbarHover";
import { initTheme } from "src/common/theme";
import "./index.css";
import { store } from "src/store/store";
import App from "./App";

initTheme();
initScrollbarHover();
initReloadOnStaleDeploy();

// Static Modal.confirm / message / notification render outside the React tree —
// wrap their holders so they inherit the dark theme.
ConfigProvider.config({
  holderRender: (children) => (
    <ConfigProvider theme={antdTheme} modal={antdModalConfig} popover={antdPopoverConfig}>
      {children}
    </ConfigProvider>
  ),
});

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <Provider store={store}>
    <ConfigProvider theme={antdTheme} modal={antdModalConfig} popover={antdPopoverConfig}>
      <App />
    </ConfigProvider>
  </Provider>,
);
