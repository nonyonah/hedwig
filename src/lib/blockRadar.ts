import fetch, { RequestInit as NodeFetchRequestInit } from 'node-fetch';

interface BlockRadarQuoteResponse {
  swapId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  priceImpact: string;
  tx: {
    to: string;
    data: string;
    value: string;
    chainId: number;
  };
}

interface BlockRadarExecuteResponse {
  swapId: string;
  status: string;
  txHash?: string;
  error?: string;
}

export class BlockRadarClient {
  private readonly baseUrl: string = 'https://api.blockradar.co/v1';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
    if (options.headers && !(options.headers instanceof Headers)) {
      headers = { ...headers, ...options.headers as Record<string, string> };
    }
    // Build fetchOptions without body
    const fetchOptions: NodeFetchRequestInit = {
      method: options.method,
      headers,
    };
    if (typeof options.body === 'string') {
      fetchOptions.body = options.body;
    }
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`BlockRadar API error: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  async getSwapQuote(params: {
    fromToken: string;
    toToken: string;
    fromAmount: string;
    walletAddress: string;
    chainId: number;
  }): Promise<BlockRadarQuoteResponse> {
    return this.fetch<BlockRadarQuoteResponse>('/addresses/swap-quote', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async executeSwap(params: {
    swapId: string;
  }): Promise<BlockRadarExecuteResponse> {
    return this.fetch<BlockRadarExecuteResponse>('/addresses/swap-execute', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }
}
