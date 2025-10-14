import { HedwigPaymentService } from '../contracts/HedwigPaymentService';
import { PaymentReceivedEvent } from '../contracts/types';
import { createClient } from '@supabase/supabase-js';

/**
 * Multi-Network Payment Service
 * Manages payment processing across multiple blockchain networks (Base, Celo)
 * Ensures the correct smart contracts are called for each network
 */
export class MultiNetworkPaymentService {
  private services: Map<string, HedwigPaymentService> = new Map();
  private supabase: any;
  private isListening: boolean = false;

  // Network configurations
  private readonly networkConfigs = {
    base: {
      chainId: 8453,
      contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_BASE || process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS,
      rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
      platformWallet: process.env.HEDWIG_PLATFORM_WALLET_BASE || process.env.HEDWIG_PLATFORM_WALLET_MAINNET,
      tokens: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDT: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
        USDbC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'
      }
    },
    celo: {
      chainId: 42220,
      contractAddress: process.env.HEDWIG_PAYMENT_CONTRACT_ADDRESS_CELO,
      rpcUrl: process.env.CELO_RPC_URL || 'https://forno.celo.org',
      platformWallet: process.env.HEDWIG_PLATFORM_WALLET_CELO,
      tokens: {
        cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
        USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
        USDT: '0x48065fbbe25f71c9282ddf5e1cd6d6a887483d5e',
        CELO: '0x471EcE3750Da237f93B8E339c536989b8978a438'
      }
    }
  };

  constructor() {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize payment services for each network
    this.initializeNetworkServices();
  }

  /**
   * Initialize payment services for all configured networks
   */
  private initializeNetworkServices(): void {
    for (const [network, config] of Object.entries(this.networkConfigs)) {
      if (config.contractAddress && config.rpcUrl) {
        try {
          const service = new HedwigPaymentService(
            config.contractAddress,
            config.rpcUrl
          );

          this.services.set(network, service);
          console.log(`✅ Initialized ${network} payment service:`, {
            contractAddress: config.contractAddress,
            chainId: config.chainId
          });
        } catch (error) {
          console.error(`❌ Failed to initialize ${network} payment service:`, error);
        }
      } else {
        console.warn(`⚠️ Skipping ${network} - missing contract address or RPC URL`);
      }
    }
  }

  /**
   * Get the appropriate payment service for a network
   */
  public getPaymentService(network: string): HedwigPaymentService | null {
    return this.services.get(network.toLowerCase()) || null;
  }

  /**
   * Get network configuration
   */
  public getNetworkConfig(network: string) {
    return this.networkConfigs[network.toLowerCase() as keyof typeof this.networkConfigs];
  }

  /**
   * Determine network from chain ID
   */
  public getNetworkFromChainId(chainId: number): string | null {
    for (const [network, config] of Object.entries(this.networkConfigs)) {
      if (config.chainId === chainId) {
        return network;
      }
    }
    return null;
  }

  /**
   * Determine network from contract address
   */
  public getNetworkFromContractAddress(contractAddress: string): string | null {
    const lowerAddress = contractAddress.toLowerCase();
    for (const [network, config] of Object.entries(this.networkConfigs)) {
      if (config.contractAddress?.toLowerCase() === lowerAddress) {
        return network;
      }
    }
    return null;
  }

  /**
   * Get token address for a specific network and token symbol
   */
  public getTokenAddress(network: string, tokenSymbol: string): string | null {
    const config = this.getNetworkConfig(network);
    if (!config) return null;

    return config.tokens[tokenSymbol as keyof typeof config.tokens] || null;
  }

  /**
   * Validate that a token is supported on a network
   */
  public isTokenSupported(network: string, tokenSymbol: string): boolean {
    const tokenAddress = this.getTokenAddress(network, tokenSymbol);
    return tokenAddress !== null;
  }

  /**
   * Start listening for payment events across all networks
   */
  public async startListening(): Promise<void> {
    if (this.isListening) {
      console.log('Multi-network payment listener is already running');
      return;
    }

    console.log('🚀 Starting multi-network payment listener...');

    const promises = Array.from(this.services.entries()).map(async ([network, service]) => {
      try {
        await service.listenForPayments(async (event: PaymentReceivedEvent) => {
          console.log(`💰 Payment received on ${network}:`, {
            invoiceId: event.invoiceId,
            amount: event.amount.toString(),
            transactionHash: event.transactionHash
          });

          // Process the payment event with network context
          await this.processPaymentEvent(event, network);
        });

        console.log(`✅ Started listening for payments on ${network}`);
      } catch (error) {
        console.error(`❌ Failed to start listener for ${network}:`, error);
      }
    });

    await Promise.all(promises);
    this.isListening = true;
    console.log('✅ Multi-network payment listener started successfully');
  }

  /**
   * Process a payment event with network context
   */
  private async processPaymentEvent(event: PaymentReceivedEvent, network: string): Promise<void> {
    try {
      console.log(`🔄 Processing ${network} payment event:`, {
        transactionHash: event.transactionHash,
        invoiceId: event.invoiceId,
        amount: event.amount.toString(),
        network: network
      });

      // Check if this event has already been processed
      const { data: existingEvent } = await this.supabase
        .from('payment_events')
        .select('id, processed')
        .eq('transaction_hash', event.transactionHash)
        .eq('invoice_id', event.invoiceId)
        .eq('network', network)
        .single();

      if (existingEvent?.processed) {
        console.log('⏭️ Payment event already processed, skipping:', event.transactionHash);
        return;
      }

      // Store payment event with network information
      const { error: dbError } = await this.supabase
        .from('payment_events')
        .upsert({
          transaction_hash: event.transactionHash,
          payer: event.payer,
          freelancer: event.freelancer,
          amount: event.amount.toString(),
          fee: event.fee.toString(),
          token: event.token,
          invoice_id: event.invoiceId,
          network: network,
          chain_id: this.getNetworkConfig(network)?.chainId,
          block_number: event.blockNumber,
          timestamp: new Date(event.timestamp * 1000).toISOString(),
          processed: false
        }, {
          onConflict: 'transaction_hash,invoice_id,network'
        });

      if (dbError) {
        console.error('❌ Error storing payment event:', dbError);
        return;
      }

      // Update the relevant record (invoice, proposal, or payment link)
      await this.updatePaymentRecord(event, network);

      // Mark event as processed
      await this.supabase
        .from('payment_events')
        .update({ processed: true })
        .eq('transaction_hash', event.transactionHash)
        .eq('invoice_id', event.invoiceId)
        .eq('network', network);

      console.log(`✅ ${network} payment event processed successfully`);
    } catch (error) {
      console.error(`❌ Error processing ${network} payment event:`, error);
    }
  }

  /**
   * Update payment record (invoice, proposal, or payment link)
   */
  private async updatePaymentRecord(event: PaymentReceivedEvent, network: string): Promise<void> {
    const networkConfig = this.getNetworkConfig(network);

    if (event.invoiceId.startsWith('invoice_')) {
      const invoiceId = event.invoiceId.replace('invoice_', '');
      await this.updateInvoice(invoiceId, event, network, networkConfig);
    } else if (event.invoiceId.startsWith('proposal_')) {
      const proposalId = event.invoiceId.replace('proposal_', '');
      await this.updateProposal(proposalId, event, network, networkConfig);
    } else {
      // Assume it's a payment link UUID
      await this.updatePaymentLink(event.invoiceId, event, network, networkConfig);
    }
  }

  /**
   * Update invoice with payment information
   */
  private async updateInvoice(invoiceId: string, event: PaymentReceivedEvent, network: string, networkConfig: any): Promise<void> {
    const { data: currentInvoice, error: fetchError } = await this.supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !currentInvoice) {
      console.error('❌ Error fetching invoice:', fetchError);
      return;
    }

    if (currentInvoice.status === 'paid') {
      console.log('⏭️ Invoice already paid, skipping update:', invoiceId);
      return;
    }

    const updateData: any = {
      status: 'paid',
      paid_at: new Date(event.timestamp * 1000).toISOString(),
      payment_transaction: event.transactionHash,
      blockchain: network,
      chain_id: networkConfig?.chainId
    };

    // Ensure required fields are populated
    if (!currentInvoice.deliverables) {
      updateData.deliverables = currentInvoice.project_description || 'Payment completed via blockchain transaction';
    }

    const { error: updateError } = await this.supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId);

    if (updateError) {
      console.error('❌ Error updating invoice:', updateError);
      return;
    }

    console.log(`✅ Updated invoice ${invoiceId} status to paid on ${network}`);

    // Update Google Calendar event if user has connected calendar
    try {
      const { googleCalendarService } = await import('../lib/googleCalendarService');

      if (currentInvoice.calendar_event_id && currentInvoice.created_by) {
        console.log(`[MultiNetworkPaymentService] Updating calendar event for paid invoice ${invoiceId}`);

        const success = await googleCalendarService.markInvoiceAsPaid(currentInvoice.created_by, {
          id: invoiceId,
          invoice_number: currentInvoice.invoice_number,
          client_name: currentInvoice.client_name,
          calendar_event_id: currentInvoice.calendar_event_id
        });

        if (success) {
          console.log(`[MultiNetworkPaymentService] Calendar event updated successfully for invoice ${invoiceId}`);

          // Track calendar event update
          try {
            const { trackEvent } = await import('../lib/posthog');
            await trackEvent(
              'calendar_event_updated',
              {
                feature: 'calendar_sync',
                invoice_id: invoiceId,
                calendar_event_id: currentInvoice.calendar_event_id,
                status: 'paid',
                timestamp: new Date().toISOString(),
              },
              currentInvoice.created_by,
            );
          } catch (trackingError) {
            console.error('[MultiNetworkPaymentService] Error tracking calendar_event_updated event:', trackingError);
          }
        } else {
          console.warn(`[MultiNetworkPaymentService] Failed to update calendar event for invoice ${invoiceId}`);
        }
      } else {
        console.log(`[MultiNetworkPaymentService] Skipping calendar update - no calendar event ID or created_by field`);
      }
    } catch (calendarError) {
      console.error('[MultiNetworkPaymentService] Error updating calendar event:', calendarError);
      // Don't fail payment processing if calendar update fails
    }

    await this.sendPaymentNotification('invoice', invoiceId, event, network);
  }

  /**
   * Update proposal with payment information
   */
  private async updateProposal(proposalId: string, event: PaymentReceivedEvent, network: string, networkConfig: any): Promise<void> {
    const { data: currentProposal, error: fetchError } = await this.supabase
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .single();

    if (fetchError || !currentProposal) {
      console.error('❌ Error fetching proposal:', fetchError);
      return;
    }

    if (currentProposal.status === 'paid') {
      console.log('⏭️ Proposal already paid, skipping update:', proposalId);
      return;
    }

    const { error: updateError } = await this.supabase
      .from('proposals')
      .update({
        status: 'paid',
        paid_at: new Date(event.timestamp * 1000).toISOString(),
        payment_transaction: event.transactionHash,
        blockchain: network,
        chain_id: networkConfig?.chainId
      })
      .eq('id', proposalId);

    if (updateError) {
      console.error('❌ Error updating proposal:', updateError);
      return;
    }

    console.log(`✅ Updated proposal ${proposalId} status to paid on ${network}`);
    await this.sendPaymentNotification('proposal', proposalId, event, network);
  }

  /**
   * Update payment link with payment information
   */
  private async updatePaymentLink(linkId: string, event: PaymentReceivedEvent, network: string, networkConfig: any): Promise<void> {
    const { data: currentLink, error: fetchError } = await this.supabase
      .from('payment_links')
      .select('*')
      .eq('id', linkId)
      .single();

    if (fetchError || !currentLink) {
      console.error('❌ Error fetching payment link:', fetchError);
      return;
    }

    if (currentLink.status === 'paid') {
      console.log('⏭️ Payment link already paid, skipping update:', linkId);
      return;
    }

    // Calculate amount based on token decimals
    const tokenDecimals = this.getTokenDecimals(network, event.token);
    const amount = parseFloat(event.amount.toString()) / Math.pow(10, tokenDecimals);

    const { error: updateError } = await this.supabase
      .from('payment_links')
      .update({
        status: 'paid',
        paid_at: new Date(event.timestamp * 1000).toISOString(),
        transaction_hash: event.transactionHash,
        paid_amount: amount,
        blockchain: network,
        chain_id: networkConfig?.chainId
      })
      .eq('id', linkId);

    if (updateError) {
      console.error('❌ Error updating payment link:', updateError);
      return;
    }

    console.log(`✅ Updated payment link ${linkId} status to paid on ${network}`);
    await this.sendPaymentNotification('payment_link', linkId, event, network);
  }

  /**
   * Get token decimals for amount calculation
   */
  private getTokenDecimals(network: string, tokenAddress: string): number {
    const config = this.getNetworkConfig(network);
    if (!config) return 6; // Default to USDC decimals

    // Find token by address
    for (const [symbol, address] of Object.entries(config.tokens)) {
      if (address.toLowerCase() === tokenAddress.toLowerCase()) {
        // Most tokens use 6 decimals, except cUSD and CELO which use 18
        return (symbol === 'cUSD' || symbol === 'CELO') ? 18 : 6;
      }
    }

    return 6; // Default fallback
  }

  /**
   * Send payment notification
   */
  private async sendPaymentNotification(
    type: 'invoice' | 'proposal' | 'payment_link',
    itemId: string,
    event: PaymentReceivedEvent,
    network: string
  ): Promise<void> {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      const tokenDecimals = this.getTokenDecimals(network, event.token);
      const amount = parseFloat(event.amount.toString()) / Math.pow(10, tokenDecimals);

      const notificationPayload = {
        type: type,
        id: itemId,
        amount: amount,
        currency: this.getTokenSymbol(network, event.token),
        transactionHash: event.transactionHash,
        payerWallet: event.payer,
        recipientWallet: event.freelancer,
        status: 'paid',
        chain: network,
        chainId: this.getNetworkConfig(network)?.chainId
      };

      console.log(`📤 Sending ${network} payment notification:`, { type, itemId, network });

      const response = await fetch(`${baseUrl}/api/webhooks/payment-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationPayload),
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Failed to send payment notification:', errorText);
      } else {
        console.log(`✅ ${network} payment notification sent successfully`);
      }
    } catch (error) {
      console.error(`❌ Error sending ${network} payment notification:`, error);
    }
  }

  /**
   * Get token symbol from address
   */
  private getTokenSymbol(network: string, tokenAddress: string): string {
    const config = this.getNetworkConfig(network);
    if (!config) return 'UNKNOWN';

    for (const [symbol, address] of Object.entries(config.tokens)) {
      if (address.toLowerCase() === tokenAddress.toLowerCase()) {
        return symbol;
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Stop listening for payment events
   */
  public stopListening(): void {
    console.log('🛑 Stopping multi-network payment listener...');

    for (const [network, service] of this.services.entries()) {
      try {
        service.stopListening();
        console.log(`✅ Stopped listening for payments on ${network}`);
      } catch (error) {
        console.error(`❌ Error stopping ${network} listener:`, error);
      }
    }

    this.isListening = false;
    console.log('✅ Multi-network payment listener stopped');
  }

  /**
   * Get status of all network services
   */
  public getStatus() {
    const status: any = {
      isListening: this.isListening,
      networks: {}
    };

    for (const [network, service] of this.services.entries()) {
      const config = this.getNetworkConfig(network);
      status.networks[network] = {
        contractAddress: service.getContractAddress(),
        chainId: config?.chainId,
        rpcUrl: config?.rpcUrl,
        isInitialized: true
      };
    }

    return status;
  }
}

// Export singleton instance
export const multiNetworkPaymentService = new MultiNetworkPaymentService();