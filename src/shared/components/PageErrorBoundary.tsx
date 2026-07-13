import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  pageName: string;
};

type State = {
  error: Error | null;
};

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[${this.props.pageName}] unrecoverable page error`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="pageFailureState" role="alert">
        <h1>{this.props.pageName} is temporarily unavailable</h1>
        <p>
          Try reloading the page. Your saved trip details will remain in this
          browser session.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </main>
    );
  }
}
