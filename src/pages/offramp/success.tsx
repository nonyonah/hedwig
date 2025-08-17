import React from 'react';
import { useRouter } from 'next/router';

export default function OfframpSuccess() {
  const router = useRouter();

  const handleClose = () => {
    if (window.opener) {
      window.close();
    } else {
      router.push('/');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex-1 flex flex-col justify-center">
        <div className="text-center">
          <h1 className="text-[#000000] text-2xl font-medium leading-tight">
            Offramp Completed. Funds will arrive in 5 minutes
          </h1>
        </div>
      </div>
      <div className="w-full max-w-sm pb-8">
        <button 
          onClick={handleClose}
          className="w-full bg-[#0466c8] text-[#ffffff] py-4 px-6 rounded-xl font-medium text-lg"
        >
          Close Page
        </button>
      </div>
    </div>
  );
}
