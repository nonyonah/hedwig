import { ethers } from 'ethers';
import InvoiceManagerABI from '../contracts/Invoice.json';

const invoiceAddress = '0xYourInvoiceContractAddress';

export async function getInvoiceStatus(invoiceId: string, provider: ethers.providers.Provider) {
  const contract = new ethers.Contract(invoiceAddress, InvoiceManagerABI, provider);
  return await contract.getStatus(invoiceId);
}

export async function createInvoiceOnChain(
  signer: ethers.Signer,
  client: string,
  amount: string,
  dueDate: number
) {
  const contract = new ethers.Contract(invoiceAddress, InvoiceManagerABI, signer);
  const tx = await contract.createInvoice(client, amount, dueDate);
  return await tx.wait();
}