import { Component } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

function Fallback({ title, message, onReset }) {
  return (
    <div
      className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center"
      role="alert"
    >
      <span className="mb-4 rounded-full bg-red-50 p-3 text-red-600">
        <AlertTriangle className="h-7 w-7" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <div className="mt-6 flex gap-3">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Try again
          </button>
        )}
        <Link
          to="/"
          className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

/** Catches render errors below it and shows a friendly fallback instead of a blank page. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] Unhandled render error', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Fallback
          title="This page hit a problem"
          message="Something unexpected happened. Your data is safe; try again or go back home."
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

/** Router-level errorElement (loader/render errors outside the boundary). */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : 'Something unexpected happened.';
  return (
    <Fallback
      title="Something went wrong"
      message={message}
      onReset={() => window.location.reload()}
    />
  );
}

export default ErrorBoundary;
