import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ProposalData, PDFGenerationOptions } from '../lib/proposalPDFService';

// React-PDF Styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    borderBottomWidth: 3,
    borderBottomColor: '#2563eb',
    paddingBottom: 20,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
    paddingLeft: 15,
  },
  text: {
    fontSize: 12,
    lineHeight: 1.6,
    color: '#333333',
    marginBottom: 10,
  },
  listItem: {
    fontSize: 12,
    marginBottom: 8,
    paddingLeft: 20,
    color: '#333333',
  },
  investmentBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 20,
    margin: '15px 0',
    textAlign: 'center',
  },
  investmentAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 15,
  },
  timelineBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    padding: 20,
    margin: '15px 0',
  },
  termsBox: {
    backgroundColor: '#fefefe',
    borderLeftWidth: 4,
    borderLeftColor: '#64748b',
    padding: 15,
    margin: '15px 0',
  },
  contactInfo: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    padding: 20,
    borderRadius: 8,
    marginTop: 30,
  },
  footer: {
    textAlign: 'center',
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    color: '#64748b',
    fontSize: 10,
  },
});

// React-PDF Page Component
export const ProposalPage: React.FC<{ proposal: ProposalData; options: PDFGenerationOptions }> = ({ proposal, options }) => {
  const { branding } = options;
  
  return (
    <Page size="A4" style={styles.page}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{proposal.project_title || 'Project Proposal'}</Text>
        <Text style={styles.subtitle}>
          For: {proposal.client_name}{'\n'}
          Date: {new Date().toLocaleDateString()}{'\n'}
          Proposal ID: {proposal.id}
        </Text>
      </View>

      {/* Executive Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Executive Summary</Text>
        <Text style={styles.text}>
          Thank you for considering our services for your {proposal.service_type.replace('_', ' ')} project. 
          This proposal outlines our approach, deliverables, timeline, and investment for bringing your vision to life.
        </Text>
        {proposal.description && (
          <Text style={styles.text}>
            Project Overview: {proposal.description}
          </Text>
        )}
      </View>

      {/* Scope of Work */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scope of Work</Text>
        
        <Text style={[styles.text, { fontWeight: 'bold', marginBottom: 10 }]}>Deliverables</Text>
        {proposal.deliverables?.map((item, index) => (
          <Text key={index} style={styles.listItem}>• {item}</Text>
        )) || (
          <Text style={styles.listItem}>• Deliverables to be defined based on project requirements</Text>
        )}
        
        {proposal.features && proposal.features.length > 0 && (
          <>
            <Text style={[styles.text, { fontWeight: 'bold', marginTop: 20, marginBottom: 10 }]}>Key Features</Text>
            {proposal.features.map((item, index) => (
              <Text key={index} style={styles.listItem}>• {item}</Text>
            ))}
          </>
        )}
        
        <View style={styles.timelineBox}>
          <Text style={[styles.text, { fontWeight: 'bold', marginBottom: 10 }]}>Timeline</Text>
          <Text style={styles.text}>Estimated Duration: {proposal.timeline || 'To be determined'}</Text>
          <Text style={[styles.text, { marginTop: 10, fontWeight: 'bold' }]}>Project Phases:</Text>
          <Text style={styles.listItem}>• Discovery & Planning (Week 1)</Text>
          <Text style={styles.listItem}>• Design & Development (Weeks 2-N)</Text>
          <Text style={styles.listItem}>• Testing & Refinement (Final Week)</Text>
          <Text style={styles.listItem}>• Launch & Handover</Text>
        </View>
      </View>

      {/* Investment */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Investment</Text>
        <View style={styles.investmentBox}>
          <Text style={styles.investmentAmount}>
            {proposal.budget ? 
              `${proposal.currency || 'USD'} ${proposal.budget.toLocaleString()}` : 
              'To be determined based on final requirements'
            }
          </Text>
          <Text style={[styles.text, { textAlign: 'center' }]}>Total Project Investment</Text>
        </View>
        
        <Text style={[styles.text, { fontWeight: 'bold', marginBottom: 10 }]}>Payment Schedule</Text>
        <Text style={styles.listItem}>• 50% deposit to begin work</Text>
        <Text style={styles.listItem}>• 25% at project milestone (mid-point)</Text>
        <Text style={styles.listItem}>• 25% upon completion and delivery</Text>
      </View>

      {/* Terms & Conditions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Terms & Conditions</Text>
        <View style={styles.termsBox}>
          <Text style={[styles.text, { fontWeight: 'bold', marginBottom: 10 }]}>General Terms</Text>
          <Text style={styles.listItem}>• All work will be completed professionally and on time</Text>
          <Text style={styles.listItem}>• Regular progress updates will be provided</Text>
          <Text style={styles.listItem}>• Source code/files will be delivered upon final payment</Text>
          <Text style={styles.listItem}>• 30-day warranty on all deliverables</Text>
          <Text style={styles.listItem}>• Additional work beyond scope will be quoted separately</Text>
        </View>
      </View>

      {/* Next Steps */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next Steps</Text>
        <Text style={styles.listItem}>1. Review and approve this proposal</Text>
        <Text style={styles.listItem}>2. Sign agreement and submit deposit</Text>
        <Text style={styles.listItem}>3. Schedule project kickoff meeting</Text>
        <Text style={styles.listItem}>4. Begin discovery and planning phase</Text>
        <Text style={[styles.text, { marginTop: 15 }]}>
          We're excited about the opportunity to work with you on this project. 
          Please don't hesitate to reach out with any questions or to discuss any modifications to this proposal.
        </Text>
      </View>

      {/* Contact Information */}
      {branding?.contactInfo && (
        <View style={styles.contactInfo}>
          <Text style={[styles.text, { color: '#ffffff', fontWeight: 'bold', marginBottom: 10 }]}>Contact Information</Text>
          <Text style={[styles.text, { color: '#ffffff' }]}>{branding.contactInfo}</Text>
        </View>
      )}

      {/* Footer */}
      <View style={styles.footer}>
        <Text>This proposal is valid for 30 days from the date above.</Text>
      </View>
    </Page>
  );
};

// React-PDF Document Component
export const ProposalDocument: React.FC<{ proposal: ProposalData; options: PDFGenerationOptions }> = ({ proposal, options }) => {
  return (
    <Document>
      <ProposalPage proposal={proposal} options={options} />
    </Document>
  );
};