'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Card } from '@flower/ui';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Backoffice error boundary', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24 }}>
          <Card title="Something went wrong">
            <p style={{ margin: 0 }}>{this.state.error.message}</p>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
