/**
 * Utility functions for handling BigInt serialization in JSON operations
 */

/**
 * Custom JSON replacer function that converts BigInt values to strings
 * @param key - The property key
 * @param value - The property value
 * @returns The value with BigInt converted to string
 */
export function bigintReplacer(key: string, value: any): any {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Safely stringify an object that may contain BigInt values
 * @param obj - The object to stringify
 * @param space - Optional spacing for pretty printing
 * @returns JSON string with BigInt values converted to strings
 */
export function safeStringify(obj: any, space?: string | number): string {
  return JSON.stringify(obj, bigintReplacer, space);
}

/**
 * Safely parse and re-stringify an object to ensure BigInt serialization
 * @param obj - The object to make serializable
 * @returns A new object with BigInt values converted to strings
 */
export function makeSerializable<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, bigintReplacer));
}

/**
 * Convert BigInt values in an object to strings recursively
 * @param obj - The object to process
 * @returns A new object with BigInt values converted to strings
 */
export function convertBigIntsToStrings(obj: any): any {
  if (typeof obj === 'bigint') {
    return obj.toString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntsToStrings);
  }
  
  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigIntsToStrings(value);
    }
    return result;
  }
  
  return obj;
}

/**
 * Type guard to check if a value is a BigInt
 * @param value - The value to check
 * @returns True if the value is a BigInt
 */
export function isBigInt(value: any): value is bigint {
  return typeof value === 'bigint';
}

/**
 * Format BigInt values for display with proper decimal places
 * @param value - The BigInt value
 * @param decimals - Number of decimal places
 * @returns Formatted string
 */
export function formatBigInt(value: bigint, decimals: number = 18): string {
  const divisor = BigInt(10 ** decimals);
  const quotient = value / divisor;
  const remainder = value % divisor;
  
  if (remainder === 0n) {
    return quotient.toString();
  }
  
  const remainderStr = remainder.toString().padStart(decimals, '0');
  const trimmedRemainder = remainderStr.replace(/0+$/, '');
  
  return `${quotient}.${trimmedRemainder}`;
}