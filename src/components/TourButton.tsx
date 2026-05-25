'use client'

import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TOUR_KEY } from '@/components/DemoTour'
import { cn } from '@/lib/utils'

export function TourButton() {
  const router = useRouter()

  function startTour() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(TOUR_KEY) // ensure tour shows on next demo visit
    }
    router.push('/dashboard')
  }

  return (
    <button
      onClick={startTour}
      className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'gap-2')}
    >
      <MapPin className="size-4" />
      Take a Tour
    </button>
  )
}
