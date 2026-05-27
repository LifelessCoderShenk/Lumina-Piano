import styles from './DensityOverview.module.css'

interface DensityOverviewProps {
  densityData: number[]
}

export function DensityOverview({ densityData }: DensityOverviewProps) {
  if (densityData.length === 0) {
    return null
  }

  return (
    <div className={styles.overview} aria-hidden="true">
      {densityData.map((density, index) => (
        <div
          className={styles.bar}
          key={`density-${index}`}
          style={{ height: `${Math.max(8, density * 100)}%` }}
        />
      ))}
    </div>
  )
}
