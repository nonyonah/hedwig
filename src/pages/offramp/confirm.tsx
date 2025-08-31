import React from 'react';
import { useRouter } from 'next/router';

interface OfframpConfirmProps {
  // Add props as needed
}

const OfframpConfirm: React.FC<OfframpConfirmProps> = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Confirm Off-ramp Transaction
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Please review your transaction details
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-gray-600">
                This page is used for off-ramp transaction confirmation.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Transaction details will be displayed here.
              </p>
            </div>
            
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => router.back()}
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OfframpConfirm;