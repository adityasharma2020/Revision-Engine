import { Component, type ErrorInfo, type ReactNode } from 'react';
import { EmptyState } from '../EmptyState';
import { Button } from '../Button';
import styles from './ErrorBoundary.module.css';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors so a single broken view never blanks the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A real app would forward this to an error-reporting service.
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className={styles.wrap}>
          <EmptyState
            icon="close"
            title="This view crashed"
            description={this.state.error.message}
            action={
              <Button variant="primary" onClick={this.reset}>
                Try again
              </Button>
            }
          />
        </div>
      );
    }
    return this.props.children;
  }
}
