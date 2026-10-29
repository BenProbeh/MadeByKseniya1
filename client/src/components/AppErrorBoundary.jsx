import { Component } from "react";

/**
 * Catches render errors (including a screen's code failing to download after a deploy) so the app never
 * stays on a blank black screen.
 */
export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error("AppErrorBoundary", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 px-8 text-center" role="alert">
          <img src="/logo.png" alt="MadeByKseniya" className="h-20 w-auto object-contain" />
          <h1 className="t-title">משהו לא נטען כמו שצריך</h1>
          <p className="t-sub max-w-xs">זה לא קשור אלייך. רענון קצר בדרך כלל מסדר את זה.</p>
          <button type="button" className="btn-violet w-full max-w-xs" onClick={() => window.location.reload()}>
            רענון
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
