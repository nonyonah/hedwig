// src/pages/wallet/export/[token].tsx
// src/pages/wallet/export/[token].tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import Head from 'next/head';
import styles from '../../../styles/WalletExport.module.css';

type ExportStatus = 'loading' | 'invalid' | 'ready' | 'success' | 'error';

interface PageState {
  status: ExportStatus;
  message: string;
  walletAddress?: string;
}

export default function WalletExportPage() {
  const router = useRouter();
  const { token } = router.query;
  const { exportWallet } = useWallets();

  const [state, setState] = useState<PageState>({
    status: 'loading',
    message: 'Verifying your export link...',
  });

  useEffect(() => {
    if (!token || Array.isArray(token)) {
      return;
    }

    const validateToken = async () => {
      try {
        const response = await fetch(`/api/wallet/export/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setState({ status: 'invalid', message: data.details || 'This link is invalid or has expired.' });
          return;
        }

        setState({
          status: 'ready',
          message: 'Your wallet is ready for export.',
          walletAddress: data.walletAddress,
        });
      } catch (err) {
        console.error('Error validating export token:', err);
        setState({ status: 'error', message: 'An unexpected error occurred. Please try again.' });
      }
    };

    validateToken();
  }, [token]);

  const handleExport = async () => {
    if (!state.walletAddress) {
      setState({ status: 'error', message: 'Wallet address not found. Cannot proceed.' });
      return;
    }

    try {
      // This triggers the Privy client-side export modal
      await exportWallet(state.walletAddress);

      // After the user completes the export, mark the token as used
      await fetch(`/api/wallet/export/${token}`, { method: 'POST' });

      setState({ 
        status: 'success',
        message: 'Your wallet has been successfully exported! This link is now invalid.'
      });

    } catch (err) {
      console.error('Error during client-side wallet export:', err);
      setState({ status: 'error', message: 'The export process was cancelled or failed.' });
    }
  };

  const renderContent = () => {
    switch (state.status) {
      case 'loading':
        return (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>{state.message}</p>
          </div>
        );

      case 'ready':
        return (
          <div className={styles.readyContainer}>
            <h2>Ready to Export</h2>
            <p>{state.message}</p>
            <p className={styles.address}>Wallet: {state.walletAddress}</p>
            <button onClick={handleExport} className={styles.exportButton}>
              Export My Wallet
            </button>
            <div className={styles.securityWarning}>
              <h3>Security Warning</h3>
              <p>Clicking the button will open a secure window to export your private key. Never share this key with anyone.</p>
            </div>
          </div>
        );

      case 'success':
        return (
          <div className={styles.completedContainer}>
            <h2>Export Successful</h2>
            <p>{state.message}</p>
          </div>
        );

      case 'invalid':
      case 'error':
        return (
          <div className={styles.errorContainer}>
            <h2>Export Failed</h2>
            <p className={styles.error}>{state.message}</p>
            <p>Please request a new export link from the app.</p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Wallet Export | Secure Key Recovery</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <h1>Secure Wallet Export</h1>
          </div>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}