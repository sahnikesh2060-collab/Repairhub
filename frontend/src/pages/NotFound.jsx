import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { ROLE_HOME } from '../lib/constants.js';
import { Button } from '../components/ui/Button.jsx';

export default function NotFound() {
  const { role } = useAuth();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="rounded-full bg-slate-100 p-4 text-slate-500">
        <MapPinOff className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page you are looking for does not exist or has moved.
      </p>
      <Button as={Link} to={ROLE_HOME[role] ?? '/'} className="mt-6">
        Go to {role ? 'my dashboard' : 'the home page'}
      </Button>
    </div>
  );
}
