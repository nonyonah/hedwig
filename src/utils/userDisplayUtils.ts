export interface UserData {
  id: string;
  username?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  telegramUsername?: string;
}

export function getDisplayUsername(user: UserData): string {
  // Priority order for username display:
  // 1. telegramUsername (most reliable for Telegram users)
  // 2. username 
  // 3. displayName
  // 4. firstName + lastName combination
  // 5. firstName only
  // 6. truncated user ID
  // 7. fallback to "Anonymous User"
  
  if (user.telegramUsername && user.telegramUsername.trim() !== '') {
    return user.telegramUsername.startsWith('@') 
      ? user.telegramUsername 
      : `@${user.telegramUsername}`;
  }
  
  if (user.username && user.username.trim() !== '') {
    return user.username;
  }
  
  if (user.displayName && user.displayName.trim() !== '') {
    return user.displayName;
  }
  
  if (user.firstName && user.firstName.trim() !== '') {
    const lastName = user.lastName && user.lastName.trim() !== '' 
      ? ` ${user.lastName}` 
      : '';
    return `${user.firstName}${lastName}`;
  }
  
  if (user.id && user.id.trim() !== '') {
    // Show first 8 characters of user ID for privacy
    return `User ${user.id.substring(0, 8)}...`;
  }
  
  return 'Anonymous User';
}

export function formatUserForLeaderboard(user: UserData, rank: number): string {
  const displayName = getDisplayUsername(user);
  
  // Don't show "Anonymous User" in leaderboard, use rank-based fallback
  if (displayName === 'Anonymous User') {
    return `User #${rank}`;
  }
  
  return displayName;
}

export function sanitizeUsername(username: string): string {
  // Remove any potentially harmful characters and trim
  return username
    .replace(/[<>\"'&]/g, '') // Remove HTML/script injection chars
    .trim()
    .substring(0, 50); // Limit length
}

export function isValidUsername(username: string): boolean {
  if (!username || username.trim() === '') {
    return false;
  }
  
  const sanitized = sanitizeUsername(username);
  return sanitized.length > 0 && sanitized !== 'Anonymous User';
}