import AppLayout from '../../components/layout/AppLayout'

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const initialSessionId = id === 'new' ? null : id
  return <AppLayout initialSessionId={initialSessionId} />
}
