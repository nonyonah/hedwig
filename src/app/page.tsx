import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect users directly to the sign-in page when they visit the root URL
  redirect('/auth/signin');
  
  // This part won't be executed due to the redirect
  return null;
}
