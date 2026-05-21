import { redirect } from 'next/navigation'

/**
 * Root route — redirects to the work-orders dashboard.
 * When authentication is wired up this will redirect to /login instead
 * when the user is not authenticated.
 */
export default function HomePage() {
  redirect('/work-orders')
}
