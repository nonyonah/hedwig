'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function OnboardingPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically update the user's profile in Supabase
    // For now, we'll just redirect to the overview page
    router.push('/overview');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-4">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Logo */}
        <div className="font-bold text-2xl mb-8" style={{ color: '#ffb5a7' }}>albus</div>
        
        {/* Title and subtitle */}
        <h1 className="text-2xl font-semibold text-center mb-2">Tell us about yourself</h1>
        <p className="text-gray-500 text-center mb-8">Briefly give us your name and surname as this will help us identify with you</p>
        
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <Input 
              type="text" 
              placeholder="First name" 
              className="w-full px-4" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              style={{
                width: '448px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid var(--Gray-300, #D5D7DA)',
                background: 'var(--Gray-25, #FDFDFD)',
                boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
              }}
            />
          </div>
          
          <div>
            <Input 
              type="text" 
              placeholder="Last name" 
              className="w-full px-4" 
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              style={{
                width: '448px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid var(--Gray-300, #D5D7DA)',
                background: 'var(--Gray-25, #FDFDFD)',
                boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
              }}
            />
          </div>
          
          <div className="pt-8">
            <Button 
              type="submit" 
              className="w-full text-white"
              style={{
                width: '448px',
                height: '36px',
                borderRadius: '8px',
                background: '#ffb5a7',
                boxShadow: '0px 1px 2px 0px rgba(10, 13, 18, 0.05)'
              }}
            >
              Continue
            </Button>
          </div>
        </form>
        
        {/* Removed the progress indicator dot as requested */}
      </div>
    </div>
  );
}