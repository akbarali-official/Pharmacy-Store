import { Component, ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' };
  static getDerivedStateFromError(e: any) { return { err: e?.message || 'Unknown error' }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="auth"><div className="card">
        <h1>Something went wrong</h1>
        <p className="muted">Please reload the page. If the problem continues, send the text below to your developer:</p>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.err}</pre>
        <button className="btn" onClick={() => location.reload()}>Reload</button>
      </div></div>
    );
  }
}
