import { ethers } from 'ethers';
import PaymentTrackerABI from '../contracts/PaymentTracker.json';

const paymentTrackerAddress = '0x3C525c914A4734F04229da1B8c572132e24385DF';

export async function isInvoicePaid(invoiceId: string, provider: ethers.providers.Provider) {
  const contract = new ethers.Contract(paymentTrackerAddress, PaymentTrackerABI.abi, provider);
  return await contract.isPaid(invoiceId);
}

export async function markInvoicePaid(signer: ethers.Signer, invoiceId: string) {
  const contract = new ethers.Contract(paymentTrackerAddress, PaymentTrackerABI.abi, signer);
  const tx = await contract.markPaid(invoiceId);
  return await tx.wait();
}