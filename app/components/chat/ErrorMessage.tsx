interface ErrorMessageProps {
  content: string
}

export default function ErrorMessage({ content }: ErrorMessageProps) {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[80%] px-4 py-2.5 text-sm rounded-lg"
        style={{ backgroundColor: '#FEF2F2', color: '#DC2626', borderRadius: 8 }}
      >
        {content}
      </div>
    </div>
  )
}
