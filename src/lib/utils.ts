import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Add this to your existing utils.ts file

/**
 * Formats an Ethereum address for display by showing the first 6 and last 4 characters
 * @param address Full Ethereum address
 * @returns Formatted address string (e.g., "0x1234...5678")
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Formats a token balance with proper decimals
 * @param balance Raw balance string
 * @param decimals Number of decimals for the token
 * @returns Formatted balance string
 */
export function formatTokenBalance(balance: string, decimals: number): string {
  try {
    // Convert to BigInt
    const balanceBigInt = BigInt(balance);
    
    // If zero, return "0"
    if (balanceBigInt === 0n) return "0";
    
    // Convert to string and pad with leading zeros if needed
    let balanceStr = balanceBigInt.toString();
    while (balanceStr.length <= decimals) {
      balanceStr = "0" + balanceStr;
    }
    
    // Insert decimal point
    const integerPart = balanceStr.slice(0, balanceStr.length - decimals) || "0";
    const fractionalPart = balanceStr.slice(balanceStr.length - decimals);
    
    // Trim trailing zeros in fractional part
    const trimmedFractionalPart = fractionalPart.replace(/0+$/, "");
    
    // Format with decimal point only if there's a fractional part
    if (trimmedFractionalPart) {
      return `${integerPart}.${trimmedFractionalPart}`;
    } else {
      return integerPart;
    }
  } catch (error) {
    console.error(`Error formatting token balance:`, error);
    return balance;
  }
}

/**
 * Formats a balance value with proper decimals, handling both string and number inputs
 * @param balance Raw balance (string or number)
 * @param decimals Number of decimals for the token (default: 18 for ETH)
 * @returns Formatted balance string
 */
export function formatBalance(
  balance: string | number,
  decimals: number = 18
): string {
  try {
    // Handle number input
    if (typeof balance === 'number') {
      // For small numbers, convert to fixed string with up to 6 decimal places
      if (balance < 0.000001 && balance > 0) {
        return '<0.000001';
      }
      
      // Format with up to 6 decimal places
      const formatted = balance.toFixed(6);
      
      // Remove trailing zeros and decimal point if needed
      return formatted.replace(/\.?0+$/, '');
    }
    
    // Handle string input - try to parse as number first
    if (typeof balance === 'string') {
      // If the string appears to be a decimal number already
      if (balance.includes('.')) {
        const num = parseFloat(balance);
        if (!isNaN(num)) {
          return formatBalance(num, 0); // Already formatted, just clean up
        }
      }
      
      // Otherwise, treat as a raw token amount that needs decimal conversion
      return formatTokenBalance(balance, decimals);
    }
    
    return '0';
  } catch (error) {
    console.error('Error formatting balance:', error);
    return '0';
  }
}
