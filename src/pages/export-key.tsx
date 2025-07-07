// Feature disabled: Private key export is currently unavailable.
// "use client";
// import { usePrivy } from '@privy-io/react-auth';
// import { useEffect, useState } from 'react';

// interface WalletInfo {
//   id: string;
//   address: string;
//   type: string;
// }

// interface ExportResponse {
//   encryption_type: string;
//   ciphertext: string;
//   encapsulated_key: string;
//   recipientPrivateKey: string;
// }

export default function ExportKeyUnavailable() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <h1 style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '2rem' }}>Private key export is currently unavailable.</h1>
    </div>
  );
}