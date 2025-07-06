if (typeof window !== 'undefined') {
  // Ensure Buffer is available globally
  if (!window.Buffer) {
    window.Buffer = require('buffer').Buffer;
  }

  // Ensure process is available globally
  if (!window.process) {
    window.process = require('process');
  }

  // Ensure crypto is available
  if (!window.crypto) {
    window.crypto = require('crypto').webcrypto;
  }
}
