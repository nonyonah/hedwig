import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js';

const DEFAULT_COUNTRY: CountryCode = 'US'; // Change as needed

/**
 * Ensures a phone number is in E.164 format (with '+'). Returns null if invalid.
 */
export function toE164(phone: string, country: CountryCode = DEFAULT_COUNTRY): string | null {
  if (!phone) return null;
  // If already E.164 (starts with '+'), check validity
  if (phone.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(phone);
    if (parsed && parsed.isValid()) {
      return parsed.number;
    }
  }
  // Try parsing with country
  try {
    const parsed = parsePhoneNumberFromString(phone, country);
    if (parsed && parsed.isValid()) {
      return parsed.number;
    }
    return null;
  } catch {
    return null;
  }
}
