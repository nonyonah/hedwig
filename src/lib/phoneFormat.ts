// Simple phone formatting without external dependencies
const DEFAULT_COUNTRY = 'US';

/**
 * Ensures a phone number is in E.164 format (with '+'). Returns null if invalid.
 * Simple implementation without external dependencies.
 */
export function toE164(phone: string, country: string = DEFAULT_COUNTRY): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // If already starts with '+', validate and return
  if (phone.startsWith('+')) {
    if (digits.length >= 10 && digits.length <= 15) {
      return '+' + digits;
    }
    return null;
  }
  
  // If starts with country code, add '+'
  if (digits.length >= 10 && digits.length <= 15) {
    // For US numbers starting with 1
    if (country === 'US' && digits.length === 11 && digits.startsWith('1')) {
      return '+' + digits;
    }
    // For US numbers without country code
    if (country === 'US' && digits.length === 10) {
      return '+1' + digits;
    }
    // For other countries, assume they include country code
    if (digits.length >= 10) {
      return '+' + digits;
    }
  }
  
  return null;
}
