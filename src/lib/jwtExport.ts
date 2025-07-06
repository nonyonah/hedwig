import jwt from 'jsonwebtoken';

const EXPORT_SECRET = process.env.PRIVATE_KEY_EXPORT_SECRET || 'dev-export-secret';

export function signExportToken(payload: { userId: string; walletAddress: string; }, expiresIn: string = '10m'): string {
  return jwt.sign(
    payload,
    EXPORT_SECRET as jwt.Secret,
    { expiresIn } as jwt.SignOptions
  );
}

export function verifyExportToken(token: string): { userId: string; walletAddress: string; iat: number; exp: number } | null {
  try {
    return jwt.verify(token, EXPORT_SECRET) as any;
  } catch (e) {
    return null;
  }
}
