const { NaturalProposalGenerator } = require('./src/lib/naturalProposalGenerator');

// Test scenarios for natural language proposal generation
const testScenarios = [
  {
    name: 'Tech Startup - Web Development',
    inputs: {
      freelancerName: 'Sarah Chen',
      freelancerTitle: 'Full-Stack Developer',
      freelancerExperience: '5+ years building scalable web applications',
      clientName: 'Mike Johnson',
      clientCompany: 'TechFlow Innovations',
      clientIndustry: 'Technology',
      projectTitle: 'E-commerce Platform Development',
      projectDescription: 'Build a modern e-commerce platform with React, Node.js, and payment integration',
      scopeOfWork: 'Frontend development, backend API, payment integration, database design, testing',
      projectComplexity: 'high',
      timeline: '12 weeks',
      budget: '$15,000 USD',
      communicationStyle: 'collaborative'
    }
  },
  {
    name: 'Small Business - Marketing Website',
    inputs: {
      freelancerName: 'Alex Rodriguez',
      freelancerTitle: 'Web Designer',
      freelancerExperience: '3 years specializing in small business websites',
      clientName: 'Emma Thompson',
      clientCompany: 'Green Garden Landscaping',
      clientIndustry: 'Landscaping',
      projectTitle: 'Business Website Redesign',
      projectDescription: 'Redesign company website with modern design, SEO optimization, and contact forms',
      scopeOfWork: 'UI/UX design, responsive layout, SEO optimization, contact forms, content migration',
      projectComplexity: 'medium',
      timeline: '6 weeks',
      budget: '$3,500 USD',
      communicationStyle: 'friendly'
    }
  },
  {
    name: 'Enterprise - Data Analytics',
    inputs: {
      freelancerName: 'Dr. James Wilson',
      freelancerTitle: 'Data Scientist',
      freelancerExperience: '8 years in enterprise data analytics and machine learning',
      clientName: 'Lisa Park',
      clientCompany: 'Global Manufacturing Corp',
      clientIndustry: 'Manufacturing',
      projectTitle: 'Predictive Analytics Dashboard',
      projectDescription: 'Develop machine learning models and dashboard for predictive maintenance',
      scopeOfWork: 'Data analysis, ML model development, dashboard creation, API integration, documentation',
      projectComplexity: 'high',
      timeline: '16 weeks',
      budget: '$25,000 USD',
      communicationStyle: 'formal'
    }
  }
];

async function testProposalGeneration() {
  console.log('🧪 Testing Natural Language Proposal Generator\n');
  
  const generator = new NaturalProposalGenerator();
  
  for (const scenario of testScenarios) {
    console.log(`\n📋 Testing: ${scenario.name}`);
    console.log('=' .repeat(50));
    
    try {
      // Test full proposal generation
      const fullProposal = generator.generateFullProposal(scenario.inputs);
      console.log('✅ Full Proposal Generated');
      console.log(`Length: ${fullProposal.length} characters`);
      
      // Test email template generation
      const emailTemplate = generator.generateEmailTemplate(scenario.inputs);
      console.log('✅ Email Template Generated');
      console.log(`Length: ${emailTemplate.length} characters`);
      
      // Test Telegram preview generation
      const telegramPreview = generator.generateTelegramPreview(scenario.inputs);
      console.log('✅ Telegram Preview Generated');
      console.log(`Length: ${telegramPreview.length} characters`);
      
      // Show a snippet of the generated content
      console.log('\n📝 Sample Content (first 200 chars):');
      console.log(fullProposal.substring(0, 200) + '...');
      
    } catch (error) {
      console.error(`❌ Error testing ${scenario.name}:`, error.message);
    }
  }
  
  console.log('\n🎉 Testing completed!');
}

// Run the tests
testProposalGeneration().catch(console.error);