require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillCdpWalletIds() {
  const { data: wallets, error } = await supabase
    .from('wallets')
    .select('id, address, cdp_wallet_id, chain')
    .in('chain', ['base', 'evm'])
    .is('cdp_wallet_id', null);

  if (error) {
    console.error('Error fetching wallets:', error);
    return;
  }

  if (!wallets || wallets.length === 0) {
    console.log('No wallets to backfill.');
    return;
  }

  const apiKey = process.env.CDP_API_KEY;
  const walletSecret = process.env.CDP_WALLET_SECRET;
  const baseUrl = process.env.CDP_API_URL || 'https://api.cdp.coinbase.com';
  if (!apiKey || !walletSecret) {
    throw new Error('CDP_API_KEY or CDP_WALLET_SECRET not configured');
  }

  for (const wallet of wallets) {
    if (!wallet.address) continue;
    try {
      const cdpApiUrl = `${baseUrl}/platform/v2/evm/accounts/base/${wallet.address}`;
      const response = await fetch(cdpApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
      });
      const data = await response.json();
      if (response.ok && data.account && data.account.wallet_id) {
        const { error: updateError } = await supabase
          .from('wallets')
          .update({ cdp_wallet_id: data.account.wallet_id })
          .eq('id', wallet.id);
        if (updateError) {
          console.error(`Error updating wallet ${wallet.id}:`, updateError);
        } else {
          console.log(`Updated wallet ${wallet.id} with cdp_wallet_id ${data.account.wallet_id}`);
        }
      } else {
        console.error(`Failed to fetch CDP wallet_id for address ${wallet.address}:`, data);
      }
    } catch (err) {
      console.error(`Error processing wallet ${wallet.id}:`, err);
    }
  }
}

backfillCdpWalletIds().then(() => {
  console.log('Backfill complete.');
  process.exit(0);
}); 