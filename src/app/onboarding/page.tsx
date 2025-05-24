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
        <div className="font-bold text-2xl mb-8 text-purple-600">albus</div>
        
        {/* Title and subtitle */}
        <h1 className="text-2xl font-semibold text-center mb-2">Tell us about yourself</h1>
        <p className="text-gray-500 text-center mb-8">Briefly give us your name and surname as this will help us identify with you</p>
        
        <form onSubmit={handleSubmit} className="w-full space-y-4">
          <div>
            <Input 
              type="text" 
              placeholder="First name" 
              className="w-full py-6 px-4 border border-gray-200 rounded-lg" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          
          <div>
            <Input 
              type="text" 
              placeholder="Last name" 
              className="w-full py-6 px-4 border border-gray-200 rounded-lg" 
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
            />
          </div>
          
          <div className="pt-8">
            <Button 
              type="submit" 
              className="w-full py-6 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Continue
            </Button>
          </div>
        </form>
        
        {/* Progress indicator */}
        <div className="mt-8 flex justify-center">
          <div className="h-2 w-2 rounded-full bg-purple-600"></div>
        </div>
      </div>
    </div>
  );
}