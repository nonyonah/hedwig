import { ethers } from 'ethers';
import InvoiceManagerABI from '../contracts/Invoice.json';

const invoiceAddress = '0xA0D9C3f16152a28Bb2672A662f7629eD21c7572f';

export async function getInvoiceStatus(invoiceId: string, provider: ethers.providers.Provider) {
  const contract = new ethers.Contract(invoiceAddress, InvoiceManagerABI.abi, provider);
  return await contract.getStatus(invoiceId);
}

export async function createInvoiceOnChain(
  signer: ethers.Signer,
  client: string,
  amount: string,
  dueDate: number
) {
  const contract = new ethers.Contract(invoiceAddress, InvoiceManagerABI.abi, signer);
  const tx = await contract.createInvoice(client, amount, dueDate);
  return await tx.wait();
}