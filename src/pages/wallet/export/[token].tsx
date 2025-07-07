// src/pages/wallet/export/[token].tsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import styles from '../../../styles/WalletExport.module.css';

interface ExportState {
  status: 'loading' | 'ready' | 'completed' | 'failed' | 'expired';
  walletAddress?: string;
  privateKey?: string;
  error?: string;
}

export default function WalletExport() {
  const router = useRouter();
  const { token } = router.query;
  const [exportState, setExportState] = useState<ExportState>({ status: 'loading' });
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [countdown, setCountdown] = useState(60); // 60 seconds countdown

  // Check export status when token is available
  useEffect(() => {
    if (!token) return;

    const checkExportStatus = async () => {
      try {
        const response = await fetch(`/api/wallet/export/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setExportState({
            status: data.error === 'Export request expired' ? 'expired' : 'failed',
            error: data.details || data.error || 'Failed to retrieve export status'
          });
          return;
        }

        setExportState({
          status: data.status,
          walletAddress: data.walletAddress
        });

        // If status is ready, we can proceed to complete the export
        if (data.status === 'ready') {
          completeExport();
        }
      } catch (error) {
        console.error('Error checking export status:', error);
        setExportState({
          status: 'failed',
          error: 'Failed to connect to server. Please try again.'
        });
      }
    };

    checkExportStatus();
  }, [token]);

  // Complete export and get private key
  const completeExport = async () => {
    try {
      const response = await fetch(`/api/wallet/complete/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        setExportState({
          status: 'failed',
          error: data.details || data.error || 'Failed to complete export'
        });
        return;
      }

      setExportState({
        status: 'completed',
        walletAddress: data.walletAddress,
        privateKey: data.privateKey
      });

      // Start countdown for auto-close
      startCountdown();
    } catch (error) {
      console.error('Error completing export:', error);
      setExportState({
        status: 'failed',
        error: 'Failed to connect to server. Please try again.'
      });
    }
  };

  // Start countdown for auto-close
  const startCountdown = () => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  };

  // Toggle private key visibility
  const togglePrivateKey = () => {
    setShowPrivateKey(!showPrivateKey);
  };

  // Copy private key to clipboard
  const copyToClipboard = () => {
    if (exportState.privateKey) {
      navigator.clipboard.writeText(exportState.privateKey);
      alert('Private key copied to clipboard!');
    }
  };

  // Render content based on export state
  const renderContent = () => {
    switch (exportState.status) {
      case 'loading':
        return (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>Loading wallet export...</p>
          </div>
        );

      case 'ready':
        return (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>Preparing your wallet for export...</p>
          </div>
        );

      case 'completed':
        return (
          <div className={styles.completedContainer}>
            <h2>Wallet Export Successful</h2>
            <p className={styles.warning}>
              <strong>WARNING:</strong> This page will automatically close in {countdown} seconds.
              Make sure to save your private key before it closes.
            </p>
            <div className={styles.walletInfo}>
              <p><strong>Wallet Address:</strong></p>
              <p className={styles.address}>{exportState.walletAddress}</p>
            </div>
            <div className={styles.privateKeyContainer}>
              <div className={styles.privateKeyHeader}>
                <p><strong>Private Key:</strong></p>
                <button 
                  onClick={togglePrivateKey} 
                  className={styles.toggleButton}
                >
                  {showPrivateKey ? 'Hide' : 'Show'}
                </button>
              </div>
              {showPrivateKey ? (
                <div className={styles.privateKeyWrapper}>
                  <p className={styles.privateKey}>{exportState.privateKey}</p>
                  <button 
                    onClick={copyToClipboard} 
                    className={styles.copyButton}
                  >
                    Copy
                  </button>
                </div>
              ) : (
                <p className={styles.hiddenKey}>••••••••••••••••••••••••••••••••••••••••••••••••••••</p>
              )}
            </div>
            <div className={styles.securityWarning}>
              <h3>Security Warning</h3>
              <ul>
                <li>Never share your private key with anyone</li>
                <li>Store it in a secure password manager</li>
                <li>Anyone with this key has full access to your wallet</li>
                <li>This key will not be available again after you leave this page</li>
              </ul>
            </div>
          </div>
        );

      case 'failed':
        return (
          <div className={styles.errorContainer}>
            <h2>Export Failed</h2>
            <p className={styles.error}>{exportState.error}</p>
            <p>Please try again or contact support if the issue persists.</p>
          </div>
        );

      case 'expired':
        return (
          <div className={styles.errorContainer}>
            <h2>Export Link Expired</h2>
            <p className={styles.error}>This export link has expired for security reasons.</p>
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
        <meta name="description" content="Securely export your wallet private key" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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