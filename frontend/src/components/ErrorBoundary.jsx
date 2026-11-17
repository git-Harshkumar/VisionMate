/**
 * ErrorBoundary Component
 * File: frontend/src/components/ErrorBoundary.jsx
 *
 * Catches render-time errors in a single dashboard card so one bad API
 * payload can never blank the entire application. Shows an accessible
 * inline fallback with a retry option.
 */

import React from "react";
import { Icon } from "./Icon";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary] ${this.props.label || "Section"} failed to render:`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: "20px" }} role="alert">
          <h3 style={{ marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}><Icon name="alert-triangle" size={18} /> {this.props.label || "This section"} hit a display error</h3>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
            The rest of VisionMate is still running normally.
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={this.handleRetry}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
