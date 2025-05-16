import { hasBankAccount, saveBankConnection } from '@/lib/mono-connect';

// With this (using underscore to indicate intentional non-use):
export async function checkExistingBankConnection(): Promise<boolean> { // _userId parameter removed
  return hasBankAccount();
}

export async function connectBankAccount(_userId: string, monoCode: string): Promise<boolean> {
  return saveBankConnection(monoCode);
}