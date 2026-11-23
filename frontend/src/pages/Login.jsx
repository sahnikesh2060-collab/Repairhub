import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Input } from '../components/ui/Input.jsx';

const schema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export default function Login() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, formState } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await login(values, { next: params.get('next') });
    } catch (err) {
      setFormError(err.message);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to book or manage repairs.">
      {params.get('next') && (
        <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Please sign in to continue.
        </p>
      )}
      <Card className="mt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            error={formState.errors.password?.message}
            {...register('password')}
          />
          {formError && (
            <p
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
              role="alert"
            >
              {formError}
            </p>
          )}
          <Button type="submit" fullWidth size="lg" icon={LogIn} loading={formState.isSubmitting}>
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-slate-600">
        New to RepairHub?{' '}
        <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
          Create an account
        </Link>
      </p>
      {import.meta.env.DEV && (
        <p className="mt-4 text-center text-xs text-slate-400">
          Demo: sita@repairhub.test / Password@123 (after{' '}
          <code>npm run seed -w backend -- --reset</code>)
        </p>
      )}
    </AuthLayout>
  );
}
