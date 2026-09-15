import React, { Component, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource-variable/noto-sans-sc";
import "../tokens.css";
import "./styles.css";
import App from "./App";
import { WorkspaceProvider } from "./workspace";
import { RemoteProvider } from "./remote";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal-error">
        <h1>工作台暂时无法显示</h1>
        <p>请重新载入页面。本地配置仍保存在此浏览器。</p>
        <button
          className="button button-primary"
          onClick={() => location.reload()}
        >
          重新载入
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorkspaceProvider>
        <RemoteProvider>
          <App />
        </RemoteProvider>
      </WorkspaceProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
