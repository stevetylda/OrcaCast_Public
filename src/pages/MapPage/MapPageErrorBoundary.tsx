import { Component, type ErrorInfo, type ReactNode } from "react";
import { MapPageFailureState } from "./MapPageFailureState";

type Props = {
  children: ReactNode;
  onRetry: () => void;
};

type State = {
  error: Error | null;
  errorInfo: ErrorInfo | null;
};

export class MapPageErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
    errorInfo: null,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });
  }

  render() {
    const { error, errorInfo } = this.state;
    if (error) {
      const detailParts = [error.message, errorInfo?.componentStack?.trim(), error.stack?.trim()]
        .filter((part): part is string => Boolean(part))
        .join("\n\n");
      return (
        <MapPageFailureState
          title="Something went wrong while rendering the map"
          message="The map hit an unexpected runtime error."
          details={detailParts}
          onRetry={this.props.onRetry}
        />
      );
    }
    return this.props.children;
  }
}
