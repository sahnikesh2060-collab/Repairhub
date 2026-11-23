import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import clsx from 'clsx';
import { Home, ShieldAlert, Wrench } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import { applyFieldErrors } from '../api/client.js';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { AuthLayout } from '../components/layout/AuthLayout.jsx';
import { Input } from '../components/ui/Input.jsx';

// Mirrors backend/src/validators (name 2-80, password 8+ with a letter and a number, phone 7-15 digits).
const schema = z.object({
  role: z.enum(['customer', 'technician']),
  name: z.string().trim().min(2, 'At least 2 characters').max(80, 'At most 80 characters'),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s\-()]/g, ''))
    .refine(
      (v) => v === '' || /^\+?\d{7,15}$/.test(v),
      'Phone must be 7-15 digits, optionally starting with +',
    ),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Include at least one letter')
    .regex(/\d/, 'Include at least one number'),
});

const ROLES = [
  {
    id: 'customer',
    title: 'I need a repair',
    text: 'Book verified technicians near you.',
    icon: Home,
  },
  {
    id: 'technician',
    title: 'I am a technician',
    text: 'Get nearby jobs and grow your business.',
    icon: Wrench,
  },
];

export default function Register() {
  const { register: signUp } = useAuth();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, watch, setValue, setError, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      role: params.get('role') === 'technician' ? 'technician' : 'customer',
      name: '',
      email: '',
      phone: '',
      password: '',
    },
  });
  const role = watch('role');

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await signUp({ ...values, phone: values.phone || undefined }, { next: params.get('next') });
    } catch (err) {
      if (!applyFieldErrors(err, setError, ['name', 'email', 'phone', 'password', 'role'])) {
        setFormError(err.message);
      }
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="It takes less than a minute.">
      <Card className="mt-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">I am joining as</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((r) => (
                <label
                  key={r.id}
                  className={clsx(
                    'flex cursor-pointer gap-3 rounded-xl border p-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500',
                    role === r.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <input
                    type="radio"
                    value={r.id}
                    checked={role === r.id}
                    onChange={() => setValue('role', r.id)}
                    className="sr-only"
                  />
                  <r.icon
                    className={clsx(
                      'mt-0.5 h-5 w-5',
                      role === r.id ? 'text-blue-600' : 'text-slate-400',
                    )}
                    aria-hidden
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{r.title}</span>
                    <span className="block text-xs text-slate-500">{r.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {role === 'technician' && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Technician accounts need admin verification before they receive jobs. You can set up
              your profile while you wait.
            </p>
          )}

          <Input
            label="Full name"
            autoComplete="name"
            required
            error={formState.errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            required
            error={formState.errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            placeholder="98XXXXXXXX"
            hint="Shared with your technician only after you confirm a booking."
            error={formState.errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters with a letter and a number."
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
          <Button type="submit" fullWidth size="lg" loading={formState.isSubmitting}>
            Create account
          </Button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
