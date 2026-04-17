interface OutOfScopeBulletProps {
  text: string
}

export default function OutOfScopeBullet({ text }: OutOfScopeBulletProps) {
  return (
    <div className="py-2.5 px-3" style={{ fontSize: '0.8125rem', color: '#9CA3AF', borderBottom: '1px solid #F3F4F6' }}>
      • {text}
    </div>
  )
}
