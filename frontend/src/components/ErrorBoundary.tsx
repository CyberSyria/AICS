import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode; fallbackTitle?: string }
type State = { error: Error | null }

/** Prevent a single page crash from blanking the whole app (green empty screen). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI crash:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg space-y-3 rounded border border-error/40 bg-card p-6 text-text">
          <h2 className="text-lg font-semibold text-error">
            {this.props.fallbackTitle || 'Something went wrong'}
          </h2>
          <p className="text-sm text-muted break-words">{this.state.error.message}</p>
          <button
            type="button"
            className="rounded border border-line px-3 py-2 text-sm text-gold-light hover:bg-panel"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
