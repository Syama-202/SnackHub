import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';
import SnackArt from '../components/SnackArt';

export default function NotFound() {
  return (
    <EmptyState
      art={<SnackArt shape="samosa" colors={['#D8A04A', '#F1CF85']} className="w-56" />}
      title="This page got eaten"
      body="The link may be old, or the snack moved shops."
      action={<Link to="/"><Button>Go home</Button></Link>}
    />
  );
}
