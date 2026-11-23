import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import * as authApi from '../../api/auth.api.js';
import { applyFieldErrors } from '../../api/client.js';
import { useAuth } from '../../hooks/useAuth.js';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Input } from '../../components/ui/Input.jsx';

// Mirrors backend PATCH /auth/me: name 2-80, phone 7-15 digits (or empty to remove),
// avatar an http(s) URL or /uploads path (or empty to remove).
const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(80, 'At most 80 characters'),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s\-()]/g, ''))
    .refine(
      (v) => v === '' || /^\+?\d{7,15}$/.test(v),
      'Phone must be 7-15 digits, optionally starting with +',
    ),
  avatar: z
    .string()
    .trim()
    .max(500)
    .refine(
      (v) => v === '' || /^https?:\/\/\S+$/i.test(v) || /^\/uploads\/[\w\-./]+$/.test(v),
      'Use an http(s) image URL',
    ),
});

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { register, handleSubmit, reset, watch, setError, formState } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name, phone: user.phone ?? '', avatar: user.avatar ?? '' },
  });
  useEffect(() => {
    reset({ name: user.name, phone: user.phone ?? '', avatar: user.avatar ?? '' });
  }, [user, reset]);

  const onSubmit = async (values) => {
    try {
      const { user: updated } = await authApi.updateMe({
        name: values.name,
        phone: values.phone || null,
        avatar: values.avatar || null,
      });
      updateUser(updated);
      toast.success('Profile saved');
    } catch (err) {
      if (!applyFieldErrors(err, setError, ['name', 'phone', 'avatar'])) toast.error(err.message);
    }
  };

  const avatar = watch('avatar');
  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Profile</h1>
      <p className="mt-1 text-sm text-slate-600">
        Your phone number is shared with a technician only after you confirm a booking.
      </p>
      <Card className="mt-6">
        <div className="mb-6 flex items-center gap-4">
          <Avatar name={watch('name') || user.name} src={avatar || undefined} size="lg" />
          <div>
            <p className="font-semibold text-slate-900">{user.email}</p>
            <p className="text-sm text-slate-500">Email cannot be changed here.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Input
            label="Full name"
            required
            autoComplete="name"
            error={formState.errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Phone"
            type="tel"
            autoComplete="tel"
            placeholder="98XXXXXXXX"
            hint="Leave empty to remove it."
            error={formState.errors.phone?.message}
            {...register('phone')}
          />
          <Input
            label="Avatar image URL"
            type="url"
            placeholder="https://…"
            hint="Leave empty to use your initials."
            error={formState.errors.avatar?.message}
            {...register('avatar')}
          />
          <Button type="submit" loading={formState.isSubmitting} disabled={!formState.isDirty}>
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}
