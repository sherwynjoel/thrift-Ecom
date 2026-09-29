import { z } from "zod";
import { INDIA_STATES } from "@/lib/india-states";
import { optionalText, phoneSchema } from "@/lib/validation/common";

export const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code");

export const addressInputSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(80),
  phone: phoneSchema,
  line1: z.string().trim().min(3, "Enter house number and street").max(120),
  line2: optionalText(120),
  landmark: optionalText(80),
  city: z.string().trim().min(2, "Enter the city").max(60),
  state: z.enum(INDIA_STATES, { errorMap: () => ({ message: "Choose a state" }) }),
  pincode: pincodeSchema,
  isDefault: z.boolean().default(false),
});

export interface AddressFormValues {
  fullName: string; phone: string; line1: string; line2: string; landmark: string;
  city: string; state: string; pincode: string; isDefault: boolean;
}

export const EMPTY_ADDRESS: AddressFormValues = {
  fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", isDefault: false,
};
