import App from "./App";
import { WorkspaceProvider } from "./workspace";
import { RemoteProvider } from "./remote";
export default function AdminApp() {
  return <WorkspaceProvider><RemoteProvider><App /></RemoteProvider></WorkspaceProvider>;
}
