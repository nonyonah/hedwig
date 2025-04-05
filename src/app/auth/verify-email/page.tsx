'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [otp, setOtp] = useState('');

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setVerificationError('Please enter all 6 digits of the verification code');
      return;
    }

    setIsVerifying(true);
    setVerificationError('');
    
    // Here you would implement the actual OTP verification logic
    // For now, we'll just simulate a successful verification
    setTimeout(() => {
      setIsVerifying(false);
      // Redirect to bio-data page after successful verification
      router.push('/auth/bio-data');
    }, 1500);
  };

  const handleResendOtp = async () => {
    setIsResending(true);
    setResendSuccess(false);
    
    // Here you would implement the actual OTP resending logic
    // For now, we'll just simulate a successful resend
    setTimeout(() => {
      setIsResending(false);
      setResendSuccess(true);
    }, 1500);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Verify Your Email</CardTitle>
          <CardDescription>
            Enter the 6-digit code we sent to your email
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-6">
          <div className="py-4">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              pattern="[0-9]*"
              type="number"
              containerClassName="justify-center gap-3"
              render={({ slots }) => (
                <InputOTPGroup>
                  {slots.map((slot, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className="w-12 h-12 text-center text-xl font-bold dark:bg-gray-800 dark:text-white"
                    />
                  ))}
                </InputOTPGroup>
              )}
            />
          </div>
          
          {verificationError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
              {verificationError}
            </div>
          )}
          
          {resendSuccess && (
            <div className="bg-green-50 text-green-600 p-3 rounded-md text-sm">
              Verification code has been resent successfully!
            </div>
          )}
          
          <Button 
            onClick={handleVerifyOtp} 
            className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-800" 
            variant="outline"
            disabled={isVerifying}
          >
            {isVerifying ? 'Verifying...' : 'Verify'}
          </Button>
          
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Didn't receive the code?{' '}
            <button 
              onClick={handleResendOtp} 
              className="text-blue-600 hover:underline focus:outline-none" 
              disabled={isResending}
            >
              {isResending ? 'Sending...' : 'Resend code'}
            </button>
          </div>
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