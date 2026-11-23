import { z } from 'zod';
import { SELF_REGISTER_ROLES } from '../config/constants.js';
import {
  avatarUrl,
  email,
  lat,
  lng,
  objectId,
  password,
  personName,
  phone,
} from './common.schemas.js';

const nonEmpty = (obj) => Object.keys(obj).length > 0;

export const registerSchema = z.object({
  body: z.object({
    name: personName,
    email,
    phone: phone.optional(),
    password,
    role: z
      .enum(SELF_REGISTER_ROLES, {
        errorMap: () => ({
          message: 'Role must be customer or technician (admins cannot self-register)',
        }),
      })
      .default('customer'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email,
    // No strength rules here: any failure must look the same ("Invalid email or password").
    password: z.string({ required_error: 'Password is required' }).min(1).max(128),
  }),
});

export const updateMeSchema = z.object({
  body: z
    .object({
      name: personName.optional(),
      phone: phone.nullable().optional(),
      avatar: avatarUrl.nullable().optional(),
    })
    .strict('Only name, phone and avatar can be updated here')
    .refine(nonEmpty, { message: 'Provide at least one of name, phone, avatar' }),
});

const addressFields = {
  label: z.string({ required_error: 'Label is required' }).trim().min(1).max(40),
  addressText: z.string({ required_error: 'Address is required' }).trim().min(3).max(300),
  lng,
  lat,
  isDefault: z.boolean().optional(),
};

export const createAddressSchema = z.object({
  body: z.object(addressFields),
});

export const updateAddressSchema = z.object({
  params: z.object({ addressId: objectId }),
  body: z
    .object({
      label: addressFields.label.optional(),
      addressText: addressFields.addressText.optional(),
      lng: lng.optional(),
      lat: lat.optional(),
      isDefault: z.boolean().optional(),
    })
    .refine(nonEmpty, { message: 'Provide at least one field to update' })
    .refine((b) => (b.lng === undefined) === (b.lat === undefined), {
      message: 'lng and lat must be sent together',
      path: ['lng'],
    }),
});

export const addressIdParamSchema = z.object({
  params: z.object({ addressId: objectId }),
});
