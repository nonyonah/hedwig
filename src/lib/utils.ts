// import { type ClassValue, clsx } from "clsx"
// import { twMerge } from "tailwind-merge"

// export function cn(...inputs: ClassValue[]) {
//   return twMerge(clsx(inputs))
// }

// // Add this to your existing utils.ts file

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
