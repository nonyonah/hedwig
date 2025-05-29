import { ethers } from 'ethers';
import PaymentTrackerABI from '../contracts/PaymentTracker.json';

const paymentTrackerAddress = '0xYourPaymentTrackerContractAddress';

export async function isInvoicePaid(invoiceId: string, provider: ethers.providers.Provider) {
  const contract = new ethers.Contract(paymentTrackerAddress, PaymentTrackerABI, provider);
  return await contract.isPaid(invoiceId);
}

export async function markInvoicePaid(signer: ethers.Signer, invoiceId: string) {
  const contract = new ethers.Contract(paymentTrackerAddress, PaymentTrackerABI, signer);
  const tx = await contract.markPaid(invoiceId);
  return await tx.wait();
}