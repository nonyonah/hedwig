import { ActionProvider, WalletProvider, Network, CreateAction } from "@coinbase/agentkit";
import { z } from "zod";
import { getWalletBalance, getRecentTransactions } from "../lib/alchemyUtils";

export const CheckWalletBalanceSchema = z.object({
  walletAddress: z.string(),
});

export const GetRecentTransactionsSchema = z.object({
  walletAddress: z.string(),
  limit: z.number().optional(),
});

export const ValidateWalletAddressSchema = z.object({
  address: z.string(),
});

class AlchemyActionProvider extends ActionProvider<WalletProvider> {
  constructor() {
    super("alchemy-action-provider", []);
  }

  @CreateAction({
    name: "check_wallet_balance",
    description: "Check the balance of a crypto wallet including ETH and all tokens",
    schema: CheckWalletBalanceSchema,
  })
  async checkWalletBalance(args: z.infer<typeof CheckWalletBalanceSchema>) {
    const balance = await getWalletBalance(args.walletAddress);
    return JSON.stringify(balance, null, 2);
  }

  @CreateAction({
    name: "get_recent_transactions",
    description: "Get recent transactions for a crypto wallet",
    schema: GetRecentTransactionsSchema,
  })
  async getRecentTransactions(args: z.infer<typeof GetRecentTransactionsSchema>) {
    const txs = await getRecentTransactions(args.walletAddress, args.limit ?? 5);
    return JSON.stringify(txs, null, 2);
  }

  @CreateAction({
    name: "validate_wallet_address",
    description: "Validate if a string is a valid Ethereum wallet address",
    schema: ValidateWalletAddressSchema,
  })
  async validateWalletAddress(args: z.infer<typeof ValidateWalletAddressSchema>) {
    const isValid = /^0x[a-fA-F0-9]{40}$/.test(args.address);
    return isValid ? "Valid Ethereum address" : "Invalid Ethereum address";
  }

  supportsNetwork = (network: Network) => true;
}

export const alchemyActionProvider = () => new AlchemyActionProvider(); 