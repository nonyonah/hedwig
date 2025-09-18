// Test script to verify account name formatting
const phoneNumber = 'telegram_810179883';

console.log('Original phone number:', phoneNumber);

// Apply the same formatting logic as in the code
let accountName = phoneNumber;
// Remove any non-alphanumeric characters except hyphens
accountName = accountName.replace(/[^a-zA-Z0-9-]/g, '');
console.log('After removing non-alphanumeric (except hyphens):', accountName);

// If it starts with a plus, replace it with 'p'
if (accountName.startsWith('+')) {
  accountName = 'p' + accountName.substring(1);
}
console.log('After handling plus sign:', accountName);

// Ensure it's between 2 and 36 characters
if (accountName.length < 2) {
  accountName = 'user-' + accountName;
} else if (accountName.length > 36) {
  accountName = accountName.substring(0, 36);
}

console.log('Final account name:', accountName);
console.log('Expected account name: telegram810179883');
console.log('Match:', accountName === 'telegram810179883');