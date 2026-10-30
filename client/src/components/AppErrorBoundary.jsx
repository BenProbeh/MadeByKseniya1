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
        <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-6 px-8 text-center overflow-x-clip" role="alert">
          <div className="ambient-light" aria-hidden="true" />
          <div className="auth-stage">
            <img src="/logo.png" alt="MadeByKseniya" className="h-20 w-auto object-contain" />
          </div>
          <div className="space-y-2">
            <span className="section-eyebrow justify-center">Reload</span>
            <h1 className="text-[1.75rem] leading-tight">
              משהו לא <span className="violet-text">נטען</span> כמו שצריך
            </h1>
            <p className="t-sub max-w-xs mx-auto">זה לא קשור אלייך. רענון קצר בדרך כלל מסדר את זה.</p>
          </div>
          <div className="w-full max-w-xs space-y-3">
            <button type="button" className="btn-violet w-full" onClick={() => window.location.reload()}>
              רענון
            </button>
            <a href="/" className="btn-ghost w-full">
              לדף הבית
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
