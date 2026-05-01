import { Component } from 'react';
import { Button, EmptyState } from './index';
import SnackArt from './SnackArt';

// a page chunk from an older build that the server no longer has
const isStaleChunk = (error) => /dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(String(error?.message ?? error?.name ?? ''));

/**
 * Catches a crash in the pages below it, so one broken component shows a way back instead of
 * a blank screen. resetKey={pathname}: moving to another page clears the crash without
 * remounting what is below. A page file missing after a new release asks for a reload, which
 * fetches the new build.
 */
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error, info) {
    // the message and where it happened only; never state or props, which can hold personal data
    console.error('page crashed:', error?.message, info?.componentStack?.split('\n').slice(0, 4).join('\n'));
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleChunk(error);
    return (
      <EmptyState
        art={<SnackArt shape="samosa" colors={['#D8A04A', '#F1CF85']} className="w-56" />}
        title={stale ? 'SnackHub was updated' : 'Something went wrong on this page'}
        body={stale ? 'Reload to get the latest version.' : 'Try again. If it keeps happening, go home and come back to it.'}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => (stale ? window.location.reload() : this.setState({ error: null }))}>{stale ? 'Reload' : 'Try again'}</Button>
            {!stale && (
              <a href="/">
                <Button variant="ghost">Go home</Button>
              </a>
            )}
          </div>
        }
      />
    );
  }
}
