// src/pages/wallet/export/[token].tsx
import { useRouter } from 'next/router';
import { useEffect, useState, useCallback } from 'react';
import { usePrivy, useLogin } from '@privy-io/react-auth';
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
  const { exportWallet, ready, authenticated } = usePrivy();
  const { login } = useLogin();

  const [state, setState] = useState<PageState>({
    status: 'loading',
    message: 'Verifying your export link...',
  });

  useEffect(() => {
    if (!token || Array.isArray(token)) {
      setState({ 
        status: 'invalid', 
        message: 'Invalid export link. Please make sure you copied the complete URL.' 
      });
      return;
    }

    const validateToken = async () => {
      try {
        console.log(`[WalletExport] Validating token: ${token.substring(0, 8)}...`);
        const response = await fetch(`/api/wallet/export/${token}`);
        const data = await response.json();

        if (!response.ok) {
          console.error(`[WalletExport] Token validation failed with status ${response.status}:`, data);
          
          // Handle specific error cases
          if (response.status === 410) {
            setState({ 
              status: 'invalid', 
              message: data.details || 'This link has expired or has already been used. Please request a new export link.' 
            });
          } else {
            setState({ 
              status: 'error', 
              message: data.details || 'This link is invalid or has expired.' 
            });
          }
          return;
        }

        console.log(`[WalletExport] Token validated for wallet: ${data.walletAddress}`);
        setState({
          status: 'ready',
          message: 'Your wallet is ready for export.',
          walletAddress: data.walletAddress,
        });
      } catch (err) {
        console.error('[WalletExport] Error validating export token:', err);
        setState({ 
          status: 'error', 
          message: 'Unable to connect to the server. Please check your internet connection and try again.' 
        });
      }
    };

    validateToken();
  }, [token]);

  const handleExport = useCallback(async () => {
    if (!state.walletAddress || !token || Array.isArray(token)) {
      setState({ 
        status: 'error', 
        message: 'Missing required information. Please try the export link again.' 
      });
      return;
    }

    setState(prev => ({ ...prev, status: 'loading', message: 'Preparing wallet export...' }));

    try {
      // Validate the token with your backend
      const validationResponse = await fetch(`/api/wallet/export/${token}`);
      if (!validationResponse.ok) {
        const errorData = await validationResponse.json().catch(() => ({}));
        throw new Error(errorData.details || 'Export link is no longer valid');
      }

      // If not authenticated, prompt login and retry
      if (!authenticated) {
        setState(prev => ({
          ...prev,
          status: 'loading',
          message: 'Please login to export your wallet...'
        }));
        await login();
        // User will need to click the button again after login
        return;
      }

      // Trigger the Privy export modal
      await exportWallet({ address: state.walletAddress });

      // Mark the export as used in your backend
      await fetch(`/api/wallet/export/${token}`, { method: 'POST' });

      setState({
        status: 'success',
        message: 'Your wallet has been successfully exported! This link is now invalid.',
        walletAddress: state.walletAddress
      });

    } catch (err) {
      console.error('[WalletExport] Error during export:', err);
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : 'The export process was cancelled or failed.',
        walletAddress: state.walletAddress
      });
    }
  }, [token, state.walletAddress, authenticated, login, exportWallet]);

  // Helper: get phone number from pageProps if available
  const phoneNumber = (typeof window !== 'undefined' && (window as any).pageProps && (window as any).pageProps.phoneNumber) || undefined;

  const renderContent = () => {
    // Add instructions for users
    const instructions = (
      <div style={{ marginBottom: 16, color: '#333', fontSize: 15 }}>
        <b>Important:</b> To export your wallet, you must log in with the <b>same phone number</b> you used to create your wallet.<br />
        {phoneNumber ? (
          <>Your phone number: <b>{phoneNumber}</b></>
        ) : (
          <span style={{ color: 'red' }}>We could not detect your phone number. Please use the same number you used on WhatsApp.</span>
        )}
      </div>
    );
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