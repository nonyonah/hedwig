/**
 * Gets a required environment variable, checking multiple patterns
 * @param name The name of the environment variable
 * @returns The value of the environment variable
 * @throws Error if the environment variable is not found
 */
export function getRequiredEnvVar(name: string): string {
  // Ensure name is a string and not undefined
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid environment variable name: ${name}`);
  }

  // Try different environment variable patterns
  const possibleNames = [
    name,
    name.replace('NEXT_PUBLIC_', ''),
    name.startsWith('NEXT_PUBLIC_') ? name : `NEXT_PUBLIC_${name}`
  ];
  
  for (const envName of possibleNames) {
    const value = process.env[envName];
    if (value && typeof value === 'string') {
      return value;
    }
  }
  
  // Log available environment variables for debugging
  console.error(`Missing required environment variable: ${name}`);
  console.error('Available environment variables:', 
    Object.keys(process.env)
      .filter(key => !key.includes('SECRET') && !key.includes('TOKEN'))
      .join(', ')
  );
  
  throw new Error(`Missing required environment variable: ${name}`);
}

/**
 * Gets an optional environment variable
 * @param name The name of the environment variable
 * @param defaultValue The default value to return if the environment variable is not found
 * @returns The value of the environment variable or the default value
 */
export function getEnvVar(name: string, defaultValue: string = ''): string {
  try {
    return getRequiredEnvVar(name);
  } catch (error) {
    return defaultValue;
  }
}