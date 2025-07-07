// src/lib/walletExportTemplate.ts
import { sanitizeWhatsAppParam } from './whatsappTemplates';

/**
 * Template: wallet_export_link
 * Parameter Format: POSITIONAL
 * Parameters: wallet_address, export_link
 * 
 * This template sends a secure link to export a wallet's private key
 */
export function walletExportLink({ 
  wallet_address, 
  export_link 
}: { 
  wallet_address: string, 
  export_link: string 
}) {
  return {
    name: 'wallet_export_link',
    language: { code: 'en' },
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: sanitizeWhatsAppParam(wallet_address, 'wallet_address') },
          { type: 'text', text: sanitizeWhatsAppParam(export_link, 'export_link') }
        ]
      }
    ]
  };
}

/**
 * Template: wallet_export_success
 * Parameter Format: POSITIONAL
 * Parameters: wallet_address
 * 
 * This template confirms successful wallet export
 */
export function walletExportSuccess({ 
  wallet_address 
}: { 
  wallet_address: string 
}) {
  return {
    name: 'wallet_export_success',
    language: { code: 'en' },
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: sanitizeWhatsAppParam(wallet_address, 'wallet_address') }
        ]
      }
    ]
  };
}

/**
 * Template: wallet_export_error
 * Parameter Format: POSITIONAL
 * Parameters: error_message
 * 
 * This template notifies about wallet export errors
 */
export function walletExportError({ 
  error_message 
}: { 
  error_message: string 
}) {
  return {
    name: 'wallet_export_error',
    language: { code: 'en' },
    components: [
      {
        type: 'BODY',
        parameters: [
          { type: 'text', text: sanitizeWhatsAppParam(error_message, 'error_message') }
        ]
      }
    ]
  };
}