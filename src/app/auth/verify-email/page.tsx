'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from 'next/navigation';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const handleResendEmail = async () => {
    setIsResending(true);
    setResendSuccess(false);
    
    // Here you would implement the actual email resending logic
    // For now, we'll just simulate a successful resend
    setTimeout(() => {
      setIsResending(false);
      setResendSuccess(true);
    }, 1500);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Check Your Email</CardTitle>
          <CardDescription>
            We've sent a verification link to your email address
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="py-4">
            <p className="text-gray-600 dark:text-gray-400">
              Please check your inbox and click on the verification link to complete your registration.
              If you don't see the email, check your spam folder.
            </p>
          </div>
          
          {resendSuccess && (
            <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
              Verification email has been resent successfully!
            </div>
          )}
          
          <Button 
            onClick={handleResendEmail} 
            variant="outline" 
            className="w-full" 
            disabled={isResending}
          >
            {isResending ? 'Sending...' : 'Resend verification email'}
          </Button>
        </CardContent>
        <CardFooter className="text-center">
          <div className="text-sm w-full">
            <Link href="/auth/signin" className="text-blue-600 hover:underline">
              Back to Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}