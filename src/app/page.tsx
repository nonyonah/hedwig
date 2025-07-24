import { redirect } from 'next/navigation';

export default function HomePage() {
  // Redirect to the main application or dashboard
  redirect('/create-payment');
}