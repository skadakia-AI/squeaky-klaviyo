interface OutOfScopeBulletProps {
  text: string
}

export default function OutOfScopeBullet({ text }: OutOfScopeBulletProps) {
  return (
    <div className="py-1.5 px-3 text-sm" style={{ color: '#9CA3AF' }}>
      • {text}
    </div>
  )
}
