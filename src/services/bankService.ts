import { hasBankAccount, saveBankConnection } from '@/lib/mono-connect';

export async function checkExistingBankConnection(userId: string): Promise<boolean> {
  return hasBankAccount();
}

export async function connectBankAccount(userId: string, monoCode: string): Promise<boolean> {
  return saveBankConnection(monoCode);
}