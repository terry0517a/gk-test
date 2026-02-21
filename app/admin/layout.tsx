export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-white text-gray-900 min-h-dvh">
      {children}
    </div>
  )
}
