import { Component } from "react";

/**
 * Catches render errors so the app never stays on a blank OLED black screen.
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
        <div className="min-h-screen flex items-center justify-center px-6 bg-oled-950">
          <div className="glass-panel p-8 max-w-md text-center space-y-4">
            <span className="section-eyebrow justify-center">MadeByKseniya</span>
            <h1 className="font-serif text-2xl text-white">משהו השתבש</h1>
            <p className="font-serif text-sm text-white/60">אפשר לרענן את העמוד ולנסות שוב.</p>
            <button type="button" className="btn-violet w-full" onClick={() => window.location.assign("/")}>
              רענון העמוד
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
