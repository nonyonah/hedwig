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
          We appreciate the opportunity to present this proposal for your {proposal.service_type.replace('_', ' ')} project. 
          Our team is committed to delivering exceptional results that exceed your expectations and drive meaningful value for your business.
        </Text>
        {proposal.description && (
          <Text style={styles.text}>
            {proposal.description}
          </Text>
        )}
        <Text style={styles.text}>
          This proposal outlines our comprehensive approach, detailed project scope, realistic timeline, and transparent pricing structure. 
          We believe this partnership will be instrumental in achieving your project goals and establishing a foundation for long-term success.
        </Text>
      </View>

      {/* Project Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Project Overview</Text>
        <Text style={styles.text}>
          Understanding your unique requirements is at the heart of our approach. We've carefully analyzed your needs and developed 
          a tailored solution that addresses your specific challenges while positioning you for future growth.
        </Text>
        
        <Text style={[styles.text, { fontWeight: 'bold', marginTop: 15, marginBottom: 10 }]}>Our Approach</Text>
        <Text style={styles.text}>
          We follow a collaborative, iterative process that ensures transparency and keeps you involved at every stage. 
          Our methodology combines industry best practices with innovative solutions to deliver results that truly make a difference.
        </Text>
      </View>

      {/* Scope of Work */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scope of Work & Deliverables</Text>
        
        <Text style={styles.text}>
          The following deliverables represent the core components of your project. Each item has been carefully considered 
          to ensure we meet your objectives while maintaining the highest standards of quality.
        </Text>
        
        <Text style={[styles.text, { fontWeight: 'bold', marginTop: 15, marginBottom: 10 }]}>Key Deliverables</Text>
        {proposal.deliverables?.map((item, index) => (
          <Text key={index} style={styles.listItem}>• {item}</Text>
        )) || (
          <Text style={styles.listItem}>• Comprehensive solution tailored to your specific requirements</Text>
        )}
        
        {proposal.features && proposal.features.length > 0 && (
          <>
            <Text style={[styles.text, { fontWeight: 'bold', marginTop: 20, marginBottom: 10 }]}>Enhanced Features</Text>
            <Text style={styles.text}>
              These additional features will enhance the overall functionality and user experience of your project:
            </Text>
            {proposal.features.map((item, index) => (
              <Text key={index} style={styles.listItem}>• {item}</Text>
            ))}
          </>
        )}
      </View>

      {/* Timeline & Methodology */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline & Project Methodology</Text>
        
        <View style={styles.timelineBox}>
          <Text style={[styles.text, { fontWeight: 'bold', marginBottom: 10 }]}>Project Duration</Text>
          <Text style={styles.text}>Estimated Timeline: {proposal.timeline || 'To be determined based on final scope'}</Text>
          
          <Text style={[styles.text, { marginTop: 15, fontWeight: 'bold', marginBottom: 10 }]}>Project Phases</Text>
          <Text style={styles.text}>
            We've structured the project into clear phases to ensure smooth execution and regular milestone achievements:
          </Text>
          <Text style={styles.listItem}>• Discovery & Strategy: Understanding your vision and defining project requirements</Text>
          <Text style={styles.listItem}>• Planning & Design: Creating detailed specifications and visual concepts</Text>
          <Text style={styles.listItem}>• Development & Implementation: Building your solution with regular progress updates</Text>
          <Text style={styles.listItem}>• Testing & Quality Assurance: Rigorous testing to ensure flawless performance</Text>
          <Text style={styles.listItem}>• Launch & Support: Smooth deployment with comprehensive handover and training</Text>
        </View>
      </View>

      {/* Investment */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Investment & Value</Text>
        
        <Text style={styles.text}>
          We believe in transparent pricing that reflects the true value of our services. This investment represents 
          not just the cost of development, but the long-term value and competitive advantage your project will provide.
        </Text>
        
        <View style={styles.investmentBox}>
          <Text style={styles.investmentAmount}>
            {proposal.budget ? 
              `${proposal.currency || 'USD'} ${proposal.budget.toLocaleString()}` : 
              'Investment to be determined based on final project scope'
            }
          </Text>
          <Text style={[styles.text, { textAlign: 'center' }]}>Total Project Investment</Text>
        </View>
        
        <Text style={styles.text}>
          This comprehensive package includes all development work, testing, documentation, and initial support. 
          We're confident this investment will deliver significant returns through improved efficiency and enhanced capabilities.
        </Text>
        
        <Text style={[styles.text, { fontWeight: 'bold', marginTop: 15, marginBottom: 10 }]}>Payment Structure</Text>
        <Text style={styles.text}>
          To ensure smooth project flow and mutual commitment, we propose the following payment schedule:
        </Text>
        <Text style={styles.listItem}>• 50% deposit upon project commencement to secure resources and begin work</Text>
        <Text style={styles.listItem}>• 25% at the midpoint milestone when core functionality is demonstrated</Text>
        <Text style={styles.listItem}>• 25% final payment upon successful completion and delivery of all deliverables</Text>
      </View>

      {/* Terms & Conditions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Partnership Terms</Text>
        
        <Text style={styles.text}>
          Our commitment extends beyond just delivering your project. We're invested in your success and have structured 
          our terms to ensure a smooth, collaborative partnership that benefits both parties.
        </Text>
        
        <View style={styles.termsBox}>
          <Text style={[styles.text, { fontWeight: 'bold', marginBottom: 10 }]}>Our Commitments to You</Text>
          <Text style={styles.listItem}>• Deliver all work according to agreed specifications and timeline</Text>
          <Text style={styles.listItem}>• Provide regular progress updates and maintain open communication</Text>
          <Text style={styles.listItem}>• Ensure all source code and project files are properly documented and transferred</Text>
          <Text style={styles.listItem}>• Offer 30 days of complimentary support following project completion</Text>
          <Text style={styles.listItem}>• Handle any additional requirements through transparent change management</Text>
          
          <Text style={[styles.text, { fontWeight: 'bold', marginTop: 15, marginBottom: 10 }]}>Quality Assurance</Text>
          <Text style={styles.listItem}>• Comprehensive testing across all supported platforms and devices</Text>
          <Text style={styles.listItem}>• Code review and optimization for performance and security</Text>
          <Text style={styles.listItem}>• Documentation and training materials for ongoing maintenance</Text>
        </View>
      </View>

      {/* Next Steps */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ready to Get Started?</Text>
        
        <Text style={styles.text}>
          We're excited about the opportunity to partner with you on this project. Your vision combined with our expertise 
          will create something truly exceptional. Here's how we can move forward together:
        </Text>
        
        <Text style={[styles.text, { fontWeight: 'bold', marginTop: 15, marginBottom: 10 }]}>Your Next Steps</Text>
        <Text style={styles.listItem}>1. Review this proposal and share any questions or feedback you may have</Text>
        <Text style={styles.listItem}>2. Schedule a brief call to discuss any final details or modifications</Text>
        <Text style={styles.listItem}>3. Approve the proposal and we'll send the formal agreement for signature</Text>
        <Text style={styles.listItem}>4. Submit the initial deposit to officially kick off the project</Text>
        <Text style={styles.listItem}>5. Join us for an exciting project kickoff meeting to begin this journey</Text>
        
        <Text style={[styles.text, { marginTop: 20 }]}>
          We understand that choosing the right partner for your project is a significant decision. We're here to answer 
          any questions, address concerns, and ensure you feel completely confident moving forward. 
        </Text>
        
        <Text style={styles.text}>
          Thank you for considering us for this opportunity. We look forward to creating something amazing together 
          and building a lasting partnership that drives your continued success.
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