import { hasBankAccount, saveBankConnection } from '@/lib/mono-connect';

// With this (using underscore to indicate intentional non-use):
export async function checkExistingBankConnection(_userId: string): Promise<boolean> {
  return hasBankAccount();
}

export async function connectBankAccount(userId: string, monoCode: string): Promise<boolean> {
  return saveBankConnection(monoCode);
}