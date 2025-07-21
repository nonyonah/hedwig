// Flutterwave Virtual Account Service
// This service handles creating static virtual accounts for bank transfers

export interface FlutterwaveVirtualAccountRequest {
  email: string;
  firstname: string;
  lastname: string;
  phonenumber: string;
  tx_ref: string;
  narration: string;
  bvn?: string; // Required for static accounts in Nigeria
  is_permanent: boolean;
  amount?: number;
}

export interface FlutterwaveVirtualAccountResponse {
  status: string;
  message: string;
  data: {
    response_code: string;
    response_message: string;
    flw_ref: string;
    order_ref: string;
    account_number: string;
    frequency: string;
    bank_name: string;
    created_at: string;
    expiry_date?: string;
    note: string;
    amount: string;
  };
}

export interface BankPaymentDetails {
  accountNumber: string;
  bankName: string;
  accountName: string;
  amount: string;
  reference: string;
}

class FlutterwaveService {
  private baseUrl = 'https://api.flutterwave.com/v3';
  private secretKey: string;

  constructor() {
    // In a real implementation, this would come from environment variables
    this.secretKey = process.env.NEXT_PUBLIC_FLUTTERWAVE_SECRET_KEY || '';
  }

  async createStaticVirtualAccount(
    request: FlutterwaveVirtualAccountRequest
  ): Promise<FlutterwaveVirtualAccountResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/virtual-account-numbers`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating virtual account:', error);
      throw new Error('Failed to create virtual account');
    }
  }

  async createBankPaymentForCrypto(
    paymentData: {
      id: string;
      amount: string;
      currency: string;
      recipientName?: string;
      reason?: string;
    },
    customerDetails: {
      email: string;
      firstname: string;
      lastname: string;
      phonenumber: string;
    }
  ): Promise<BankPaymentDetails> {
    // Convert crypto amount to Naira
    const nairaAmount = this.convertCryptoToNaira(paymentData.amount, paymentData.currency);
    
    const request: FlutterwaveVirtualAccountRequest = {
      email: customerDetails.email,
      firstname: customerDetails.firstname,
      lastname: customerDetails.lastname,
      phonenumber: customerDetails.phonenumber,
      tx_ref: `hedwig_${paymentData.id}_${Date.now()}`,
      narration: paymentData.reason || 'Crypto Payment via Hedwig',
      is_permanent: true, // Static account
      amount: Math.ceil(nairaAmount), // Round up to nearest Naira
    };

    const response = await this.createStaticVirtualAccount(request);

    return {
      accountNumber: response.data.account_number,
      bankName: response.data.bank_name,
      accountName: `${customerDetails.firstname} ${customerDetails.lastname}`,
      amount: response.data.amount,
      reference: response.data.order_ref,
    };
  }

  private convertCryptoToNaira(amount: string, currency: string): number {
    // Approximate exchange rates (in a real app, these would come from an API)
    const exchangeRates: Record<string, number> = {
      'ETH': 3800000, // 1 ETH ≈ ₦3,800,000 (approximate)
      'USDC': 1650,   // 1 USDC ≈ ₦1,650 (approximate)
      'BTC': 95000000, // 1 BTC ≈ ₦95,000,000 (approximate)
    };

    const rate = exchangeRates[currency] || 1650; // Default to USDC rate
    const cryptoAmount = parseFloat(amount);
    return cryptoAmount * rate;
  }

  // Webhook handler for payment notifications
  async handleWebhook(webhookData: any): Promise<boolean> {
    try {
      // Verify webhook signature here in production
      
      if (webhookData.event === 'charge.completed' && webhookData.data.status === 'successful') {
        // Payment was successful
        console.log('Payment completed:', webhookData.data);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error handling webhook:', error);
      return false;
    }
  }
}

export const flutterwaveService = new FlutterwaveService();