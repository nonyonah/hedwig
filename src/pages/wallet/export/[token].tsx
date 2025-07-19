// src/pages/wallet/export/[token].tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import styles from '../../../styles/WalletExport.module.css';

type ExportStatus = 'loading' | 'invalid' | 'ready' | 'deprecated' | 'error';

interface PageState {
  status: ExportStatus;
  message: string;
  walletAddress?: string;
}

export default function WalletExportPage() {
  const router = useRouter();
  const { token } = router.query;

  const [state, setState] = useState<PageState>({
    status: 'loading',
    message: 'Checking export link...',
  });

  useEffect(() => {
    if (!token || Array.isArray(token)) {
      setState({ 
        status: 'invalid', 
        message: 'Invalid export link. Please make sure you copied the complete URL.' 
      });
      return;
    }

    // Since we've moved away from Privy, wallet export is no longer available
    setState({
      status: 'deprecated',
      message: 'Wallet export functionality has been deprecated. We have migrated to a new wallet system (CDP) that provides better security and functionality.',
    });
  }, [token]);

  const renderContent = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>{state.message}</p>
          </div>
        );

      case 'deprecated':
        return (
          <div className={styles.readyContainer}>
            <h2>🔄 System Migration</h2>
            <p>{state.message}</p>
            <div className={styles.securityWarning}>
              <h3>What's Changed?</h3>
              <p>We've upgraded to Coinbase Developer Platform (CDP) for better security and features. Your existing wallets remain safe, but export functionality is no longer available through this method.</p>
              <p>For wallet management, please use our WhatsApp interface or contact support.</p>
            </div>
          </div>
        );

      case 'invalid':
      case 'error':
        return (
          <div className={styles.errorContainer}>
            <h2>❌ Error</h2>
            <p>{state.message}</p>
            <button onClick={() => router.push('/')} className={styles.homeButton}>
              Go Home
            </button>
          </div>
        );

      default:
        return (
          <div className={styles.errorContainer}>
            <h2>❌ Unknown State</h2>
            <p>Something went wrong. Please try again.</p>
          </div>
        );
    }
  };

  return (
    <>
      <Head>
        <title>Wallet Export - Hedwig</title>
        <meta name="description" content="Export your Hedwig wallet" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.header}>
            <h1>🦉 Hedwig Wallet Export</h1>
          </div>
          {renderContent()}
        </div>
      </div>
    </>
  );
}