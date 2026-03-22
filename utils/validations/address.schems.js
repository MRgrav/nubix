import z from "zod";
import { de } from "zod/locales";

const addressSchema = z.object({
  houseNo: z.string().optional(),
  addressLine1: z.string().min(1, "Address line 1 required"),
  addressLine2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().min(1, "City required"),
  district: z.string().optional(),
  state: z.string().min(1, "State required"),
  pinCode: z.string().regex(/^\d{6}$/, "PIN code must be exactly 6 digits"),
  postOffice: z.string().optional(),
  country: z.string().default("India"),
  addressType: z
    .enum(["CURRENT", "PERMANENT", "CORRESPONDENCE", "OTHER"])
    .default("CURRENT"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

export default addressSchema;
