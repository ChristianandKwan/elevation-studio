import type { Metadata } from 'next'
import HouseStyleScreen from '@/components/houseStyle/HouseStyleScreen'

export const metadata: Metadata = { title: 'House style — Elevation Studio' }

/**
 * The house style Claude follows for Christian & Kwan's proposals, and the
 * rules waiting for them to decide. The layout has already checked sign-in;
 * everything live comes from /api/house-style.
 */
export default function HouseStylePage() {
  return <HouseStyleScreen />
}
