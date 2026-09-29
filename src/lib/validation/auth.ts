import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(100);

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(60),
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password") });
export const resetRequestSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password: passwordSchema });
export const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(60) });
export const changePasswordSchema = z.object({ current: z.string().min(1), next: passwordSchema });

export type RegisterInput = z.infer<typeof registerSchema>;
