import React from 'react';

export default function OfframpLoading() {
  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col items-center justify-center">
      <div className="w-full max-w-sm px-6 flex flex-col items-center">
        <div className="relative w-10 h-10 mb-12">
          <div className="w-6 h-6 bg-[#000000] absolute top-0 left-0 animate-pulse"></div>
          <div className="w-6 h-6 bg-[#000000] absolute top-4 left-4 animate-pulse" style={{ animationDelay: '0.2s' }}></div>
        </div>
        <h1 className="text-[#000000] text-2xl font-normal tracking-wide text-center">We're doing the thing...</h1>
      </div>
    </div>
  );
}
