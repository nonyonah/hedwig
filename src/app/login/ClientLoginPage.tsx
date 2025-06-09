// 'use client';

// import { useState, useEffect } from 'react';
// import { Button } from '@/components/ui/button';
// import Image from 'next/image';
// import { useRouter } from 'next/navigation';
// import { usePrivy } from '@privy-io/react-auth';
// import { Wallet } from 'lucide-react';

// export default function ClientLoginPage() { // Renamed from LoginPage
//   const [loading, setLoading] = useState(false);
//   const router = useRouter();
//   const { login, authenticated, ready } = usePrivy();

//   useEffect(() => {
//     if (ready && authenticated) {
//       router.replace('/overview');
//     }
//   }, [ready, authenticated, router]);

//   const handlePrivyLogin = async () => {
//     setLoading(true);
//     try {
//       login();
//     } catch (error) {
//       console.error('Error with Privy login:', error);
//       setLoading(false);
//     }
//   };

//   return (
//     <div className="min-h-screen flex flex-col bg-white">
//       {/* Header with logo */}
//       <header className="flex flex-col items-center w-full bg-white px-[32px]">
//         <div className="flex w-full max-w-[1280px] h-[72px] items-center justify-between">
//           <div className="flex items-center gap-x-8">
//             <div>
//               <Image src="/logo.png" alt="Albus Logo" width={80} height={40} priority />
//             </div>
//           </div>
//         </div>
//       </header>

//       {/* Main content */}
//       <div className="flex-grow flex flex-col items-center justify-center p-4">
//         <div className="w-full max-w-md flex flex-col items-center">
//           <h1 className="text-2xl font-semibold text-center mb-2">Log into your account</h1>
//           <p className="text-gray-500 text-center mb-8">Let Albus handle the numbers while you focus on the work.</p>
//           <Button 
//             variant="outline" 
//             className="w-[448px] h-[36px] mb-6 flex items-center justify-center gap-2 bg-white border border-gray-300 text-black hover:bg-gray-50"
//             onClick={handlePrivyLogin}
//             disabled={!ready || loading}
//           >
//             <Wallet size={20} className="mr-2" />
//             <span className="ml-2">Sign in with your wallet</span>
//           </Button>
//           <p className="text-xs text-gray-500 text-center mt-8">
//             By clicking &quot;Sign in with your wallet&quot; you agree to our{' '}
//             <a href="#" className="underline">Terms of Use</a> and{' '}
//             <a href="#" className="underline">Privacy policy</a>
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }
